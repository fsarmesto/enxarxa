// Borra la cuenta: credenciales, partidos, pabellones y perfil se eliminan en cascada.
import { admin, cors, json, userFromRequest } from "../_shared/sync.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const user = await userFromRequest(db, req);
  if (!user) return json({ error: "Inicia sesión de nuevo" }, 401);
  const { error } = await db.auth.admin.deleteUser(user.id);
  return error ? json({ error: "No se ha podido borrar la cuenta" }, 500) : json({ ok: true });
});
