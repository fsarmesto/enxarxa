// Aviso de la hora de salida hacia el pabellón (issue #73): cron "aviso-salida" cada 5 minutos (cron.sql). Sin entrar en
// iSquad: partidos de hoy y tiempos de trayecto (venues.min) de la base de datos. 15 min antes de la hora de salida
// (regla en _shared/salida.ts): "Sal a las 15:40 hacia …". Solo árbitros con profiles.aviso_salida (Ajustes; activado por
// defecto). Una vez por partido, hora y pabellón (push_log salida:…); si la hora del aviso ya ha pasado cuando se conoce
// (designación o cambio de última hora), no se manda.
import { admin, cors, json } from "../_shared/sync.ts";
import { cap, sendToUser } from "../_shared/push.ts";
import { porIds, todas } from "../_shared/db.ts";
import { claveSalida, hhmm, minDe, type PartidoSalida, salidas } from "../_shared/salida.ts";

const VENTANA = 10;   // minutos de margen por si una pasada del cron llega tarde o se salta

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "No autorizado" }, 401);
  const ahora = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date());
  const hoy = ahora.slice(0, 10), min = minDe(ahora.slice(11, 16));
  if (min < 5 * 60) return json({ skipped: "noche", madrid: ahora });
  const db = admin();

  const users = (await todas<{ user_id: string }>(() => db.from("profiles").select("user_id").eq("tipo", "arbitro").eq("aviso_salida", true).order("user_id"))).map((p) => p.user_id);
  const ms = await porIds<PartidoSalida & { user_id: string; venue: string | null }>(users, (g) => db.from("matches")
    .select("user_id, id, date, time, venue, venue_key, estado, missing_since").in("user_id", g).eq("date", hoy).order("user_id").order("id"));
  const conPartido = [...new Set(ms.map((m) => m.user_id))];
  const vs = await porIds<{ user_id: string; venue_key: string; label: string | null; min: number | null }>(conPartido, (g) => db.from("venues")
    .select("user_id, venue_key, label, min").in("user_id", g).not("min", "is", null).order("user_id").order("venue_key"));

  let enviados = 0, pendientes = 0;
  for (const u of conPartido) {
    const mios = ms.filter((m) => m.user_id === u), venues = new Map(vs.filter((v) => v.user_id === u).map((v) => [v.venue_key, v]));
    for (const s of salidas(mios, (k) => venues.get(k)?.min)) {
      if (min < s.aviso) { pendientes++; continue; }
      if (min >= s.aviso + VENTANA) continue;   // llegó tarde (designación o cambio de última hora): ya no
      const key = claveSalida(s);
      const { data: done } = await db.from("push_log").select("key").eq("user_id", u).eq("key", key).maybeSingle();
      if (done) continue;
      const m = mios.find((x) => x.id === s.id)!, pab = venues.get(s.venue_key)?.label || cap(m.venue || s.venue_key);
      await sendToUser(db, u, (t) => ({ ...t.salida(hhmm(s.salida), pab, s.time, s.trayecto), tag: `salida-${s.id}`,
        url: `./?vista=agenda&partido=${encodeURIComponent(s.id)}` }), key);
      enviados++;
    }
  }
  return json({ madrid: ahora, arbitros: users.length, conPartido: conPartido.length, enviados, pendientes });
});
