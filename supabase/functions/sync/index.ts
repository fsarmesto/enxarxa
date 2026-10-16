// Sincroniza designaciones. Con la cabecera x-cron-secret: todos los usuarios (tarea programada).
// Con la sesión de un usuario: solo ese usuario (botón "Actualizar ahora").
import { admin, cors, fillKm, json, syncUser, userFromRequest } from "../_shared/sync.ts";

Deno.serve(async (req) => {
  // Hora límite contada desde que llega la petición: las funciones tienen ~150 s y pg_net corta a los 120 s.
  const deadline = Date.now() + 100_000;
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") === secret) {
    // Primero los partidos de todos (los que llevan más tiempo sin actualizarse, antes); con el tiempo que sobre, los km.
    // Los que fallaron la última vez (credenciales caducadas, etc.) van al final para no comerse el tiempo de los demás.
    const { data: users } = await db.from("profiles").select("user_id")
      .order("last_error", { ascending: true, nullsFirst: true }).order("last_sync", { ascending: true, nullsFirst: true });
    let ok = 0, done = 0;
    for (const u of users || []) {
      if (Date.now() > deadline - 15_000) break;
      done++;
      if ((await syncUser(db, u.user_id, { km: "none", deadline })).ok) ok++;
    }
    for (const u of users || []) {
      if (Date.now() > deadline) break;
      if (await fillKm(db, u.user_id, deadline) === "quota") break;   // sin cupo en ORS: no tiene sentido seguir hoy
    }
    return json({ users: users?.length || 0, synced: done, ok });
  }
  const user = await userFromRequest(db, req);
  if (!user) return json({ error: "Inicia sesión de nuevo" }, 401);
  const { data: prof } = await db.from("profiles").select("last_sync").eq("user_id", user.id).maybeSingle();
  if (prof?.last_sync && Date.now() - new Date(prof.last_sync).getTime() < 60_000) return json({ ok: true, skipped: true });
  return json(await syncUser(db, user.id, { km: "background", deadline: deadline + 30_000 }));
});
