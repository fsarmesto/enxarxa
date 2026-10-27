// Cuentas sin usar (política de privacidad, 22-oct-2026): a los 6 meses sin abrir la app se borran con todos sus datos;
// 30 días antes, un aviso a quien tiene notificaciones (una vez). Cron diario "inactivas" (cron.sql).
import { admin, borrarCuenta, cors, json } from "../_shared/sync.ts";
import { sendToUser } from "../_shared/push.ts";
import { todas } from "../_shared/db.ts";

const MESES = 6, AVISO_DIAS = 30;
const masMeses = (iso: string, n: number) => { const d = new Date(iso); d.setUTCMonth(d.getUTCMonth() + n); return d; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "No autorizado" }, 401);
  const db = admin(), now = new Date();
  const limite = masMeses(now.toISOString(), -MESES);
  const avisoDesde = new Date(limite.getTime() + AVISO_DIAS * 864e5);

  const viejas = await todas<{ user_id: string }>(() => db.from("profiles").select("user_id").lt("last_active", limite.toISOString()).order("user_id"));
  let borradas = 0;
  for (const p of viejas || []) if (await borrarCuenta(db, p.user_id)) borradas++;

  const casi = await todas<{ user_id: string; last_active: string }>(() => db.from("profiles").select("user_id, last_active")
    .lt("last_active", avisoDesde.toISOString()).gte("last_active", limite.toISOString()).order("user_id"));
  let avisadas = 0;
  for (const p of casi || []) {
    const key = `aviso-inactiva:${p.user_id}:${p.last_active.slice(0, 10)}`;
    const { data: done } = await db.from("pub_cache").select("key").eq("key", key).maybeSingle();
    if (done) continue;
    const fin = masMeses(p.last_active, MESES).toISOString().slice(0, 10);
    const r = await sendToUser(db, p.user_id, (t) => ({ ...t.inactiva(fin), tag: "inactiva", url: "./" }));
    await db.from("pub_cache").upsert({ key, data: { enviados: r.ok }, fetched_at: now.toISOString() });
    if (r.ok) avisadas++;
  }
  return json({ borradas, avisadas });
});
