// Borra la cuenta: credenciales y sesión de iSquad, partidos, pabellones, perfil (con el enlace del calendario),
// avisos, equipos y avisos enviados se eliminan en cascada; las entradas de caché del usuario, a mano (borrarCuenta).
import { admin, borrarCuenta, cors, json, userFromRequest } from "../_shared/sync.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const user = await userFromRequest(db, req);
  if (!user) return json({ error: "Inicia sesión de nuevo" }, 401);
  return (await borrarCuenta(db, user.id)) ? json({ ok: true }) : json({ error: "No se ha podido borrar la cuenta" }, 500);
});
