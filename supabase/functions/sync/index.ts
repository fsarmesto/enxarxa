// Sincroniza designaciones. Con la cabecera x-cron-secret: todos los usuarios (tarea programada).
// Con la sesión de un usuario: solo ese usuario (botón "Actualizar ahora").
import { admin, cors, json, syncUser, userFromRequest } from "../_shared/sync.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") === secret) {
    const { data: users } = await db.from("profiles").select("user_id");
    let ok = 0;
    for (const u of users || []) if ((await syncUser(db, u.user_id, { waitKm: true })).ok) ok++;
    return json({ users: users?.length || 0, ok });
  }
  const user = await userFromRequest(db, req);
  if (!user) return json({ error: "Inicia sesión de nuevo" }, 401);
  const { data: prof } = await db.from("profiles").select("last_sync").eq("user_id", user.id).maybeSingle();
  if (prof?.last_sync && Date.now() - new Date(prof.last_sync).getTime() < 60_000) return json({ ok: true, skipped: true });
  return json(await syncUser(db, user.id));
});
