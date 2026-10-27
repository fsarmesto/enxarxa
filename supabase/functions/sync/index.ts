// Sincroniza designaciones.
// - Cron (cabecera x-cron-secret, sin cuerpo): reparte el trabajo en una ejecución por árbitro, porque en una sola
//   no caben la CPU y la memoria de leer las páginas de iSquad de todos. Primero los partidos (en paralelo) y,
//   con el tiempo que quede, los km (uno detrás de otro: el candado de km solo deja uno a la vez).
// - Cron con {user_id, mode: "sync" | "km" | "quick"}: el trabajo de un árbitro (quick = vigilancia rápida).
// - Con la sesión de un usuario: solo ese usuario (botón "Actualizar ahora").
import { admin, cors, fillKm, json, syncUser, userFromRequest } from "../_shared/sync.ts";
import { aTurnos, todas } from "../_shared/db.ts";

Deno.serve(async (req) => {
  // Hora límite contada desde que llega la petición: las funciones tienen ~150 s y pg_net corta a los 120 s.
  const deadline = Date.now() + 100_000;
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") === secret) {
    let body: { user_id?: string; mode?: string; until?: number } = {};
    try { body = await req.json(); } catch { /* sin cuerpo: reparto */ }
    // until: hora límite del reparto, para acabar (y guardar lo hecho) antes de que corte la petición.
    const dl = Math.min(deadline, body.until || Infinity);
    if (body.user_id && body.mode === "sync") return json(await syncUser(db, body.user_id, { km: "none", deadline: dl, notify: true }));
    // Vigilancia (función vigilar): solo designaciones de la temporada en curso, avisando de lo nuevo o cambiado.
    if (body.user_id && body.mode === "quick") return json(await syncUser(db, body.user_id, { km: "none", deadline: dl, quick: true, notify: true }));
    if (body.user_id && body.mode === "km") return json({ km: await fillKm(db, body.user_id, dl) });

    const self = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sync`;
    const call = async (user_id: string, mode: string) => {
      try {
        const r = await fetch(self, { method: "POST", body: JSON.stringify({ user_id, mode, until: deadline - 3000 }),
          headers: { "Content-Type": "application/json", "x-cron-secret": secret }, signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())) });
        return await r.json();
      } catch (e) {
        // Si se agota la hora límite, la ejecución del árbitro sigue por su cuenta y lo que falte sale en la siguiente pasada.
        const cut = (e as Error).name === "TimeoutError";
        return { ok: false, error: cut ? "cortado por tiempo" : (e as Error).message, km: cut ? "cortado por tiempo" : "error" };
      }
    };
    // Los que fallaron la última vez van al final; los demás, del que lleva más tiempo sin actualizarse al que menos.
    const users = await todas<{ user_id: string }>(() => db.from("profiles").select("user_id").neq("tipo", "deportista")
      .order("last_error", { ascending: true, nullsFirst: true }).order("last_sync", { ascending: true, nullsFirst: true }).order("user_id"));
    const list = users.map((u) => u.user_id);
    // Como mucho 4 a la vez (ver aTurnos); los que no caben en el tiempo, en la siguiente pasada (van los primeros).
    const synced = await aTurnos(list, 4, (id) => Date.now() > deadline - 30_000 ? Promise.resolve({ ok: false, error: "sin tiempo" }) : call(id, "sync"));
    // Km con el tiempo que quede: primero quien tiene pabellones sin km o sin duración.
    const { data: pend } = await db.from("venues").select("user_id").or("km.is.null,min.is.null").limit(1000);
    const conPend = new Set((pend || []).map((v: { user_id: string }) => v.user_id));
    const kmOrder = [...list.filter((id) => conPend.has(id)), ...list.filter((id) => !conPend.has(id))];
    const km: string[] = [];
    for (const id of kmOrder) {
      if (Date.now() > deadline - 20_000) { km.push("sin tiempo"); continue; }
      const r = (await call(id, "km"))?.km ?? "error";
      km.push(r);
      if (r === "quota") break;   // sin cupo en ORS: no tiene sentido seguir hoy
    }
    return json({ users: list.length, ok: synced.filter((r) => r?.ok).length, sinTiempo: synced.filter((r) => r?.error === "sin tiempo").length, km });
  }
  const user = await userFromRequest(db, req);
  if (!user) return json({ error: "Inicia sesión de nuevo" }, 401);
  const { data: prof } = await db.from("profiles").select("last_sync").eq("user_id", user.id).maybeSingle();
  if (prof?.last_sync && Date.now() - new Date(prof.last_sync).getTime() < 60_000) return json({ ok: true, skipped: true });
  return json(await syncUser(db, user.id, { km: "background", deadline: deadline + 30_000 }));
});
