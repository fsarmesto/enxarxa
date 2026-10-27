// Compartir coche (opcional). Con la sesión del árbitro:
// - {action:"estado"} / {action:"activar", activo}: si participa.
// - {action:"sugerencias"}: para cada designación suya de los próximos 30 días, otros árbitros que participan y ese
//   mismo día van al mismo pabellón o a la misma población. Solo se ve entre quienes lo tienen activado, y solo
//   nombre, hora, pabellón y población de salida.
import { admin, cors, json, userFromRequest } from "../_shared/sync.ts";
import { porIds } from "../_shared/db.ts";

const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const town = (addr: string) => norm(addr).match(/\b\d{5}\s+([^,]+)/)?.[1]?.trim() || "";
const cap = (s: string) => (s || "").toLowerCase().replace(/(^|[\s'-])\S/g, (c) => c.toUpperCase());

type M = { id: string; user_id: string; date: string; time: string; venue: string; venue_key: string; addr: string; crew: { n: string; me: boolean }[] | null; teams: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const user = await userFromRequest(db, req);
  if (!user) return json({ error: "Inicia sesión de nuevo" }, 401);
  let body: { action?: string; activo?: boolean } = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }

  if (body.action === "activar") {
    const { error } = await db.from("profiles").update({ coche: body.activo === true }).eq("user_id", user.id);
    return error ? json({ error: "No se ha podido guardar" }, 500) : json({ ok: true, activo: body.activo === true });
  }
  const { data: me } = await db.from("profiles").select("coche").eq("user_id", user.id).maybeSingle();
  if (body.action === "estado") return json({ ok: true, activo: !!me?.coche });
  if (body.action !== "sugerencias") return json({ error: "Acción no válida" }, 400);
  if (!me?.coche) return json({ ok: true, activo: false, sugerencias: {} });

  const today = new Date().toISOString().slice(0, 10), until = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const { data: others } = await db.from("profiles").select("user_id, nombre, origin").eq("coche", true).neq("user_id", user.id);
  if (!others?.length) return json({ ok: true, activo: true, sugerencias: {}, participantes: 1 });
  const cols = "id, user_id, date, time, venue, venue_key, addr, crew, teams";
  const { data: mine } = await db.from("matches").select(cols).eq("user_id", user.id).gte("date", today).lte("date", until);
  if (!mine?.length) return json({ ok: true, activo: true, sugerencias: {}, participantes: others.length + 1 });
  const dates = [...new Set((mine as M[]).map((m) => m.date))];
  const theirs = await porIds<M>(others.map((o) => o.user_id), (g) => db.from("matches").select(cols).in("user_id", g).in("date", dates).order("user_id").order("id"));
  const who = new Map(others.map((o) => [o.user_id, o]));
  // Nombre "Nombre Apellido" tal como sale en sus designaciones (la cabecera de iSquad lo da al revés).
  const displayName = (m: M) => cap((m.crew || []).find((c) => c.me)?.n || who.get(m.user_id)?.nombre || "");
  const sugerencias: Record<string, unknown[]> = {};
  for (const m of mine as M[]) {
    const t = town(m.addr), list: unknown[] = [], seen = new Set<string>();
    for (const o of (theirs || []) as M[]) {
      if (o.date !== m.date || seen.has(o.user_id)) continue;
      const sameVenue = o.venue_key === m.venue_key, sameMatch = sameVenue && o.time === m.time;
      if (!sameVenue && (!t || town(o.addr) !== t)) continue;
      seen.add(o.user_id);
      list.push({ nombre: displayName(o), hora: o.time, pabellon: cap(o.venue.split(/\s+-\s*|\s*-\s+/)[0]), poblacion: cap(town(o.addr)),
        origen: cap(who.get(o.user_id)?.origin || ""), mismo_pabellon: sameVenue, mismo_partido: sameMatch });
    }
    if (list.length) sugerencias[m.id] = list;
  }
  return json({ ok: true, activo: true, sugerencias, participantes: others.length + 1 });
});
