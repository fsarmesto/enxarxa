// Recordatorio de cobros del domingo a las 20:00 (notify): solo a los árbitros a los que les queda algún partido de la
// semana (de lunes a hoy) por pedir en iSquad. Si todo está pedido o pagado, no se avisa. Mismo criterio que "Por
// solicitar" en la web (payState): sin pedir ni pagar, plazo no terminado, con importe (o aún sin recibo) y sin marcar
// como cobrado a mano. Uno por usuario y semana (push_log "domingo:<lunes>"), en su idioma.
import { sendToUser } from "./push.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
type M = { user_id: string; comp: string; paid: boolean | null; fcvb_pago: string | null; fcvb_accion: string | null; fcvb_tarifa: string | null; fcvb_gastos: string | null };

export const porPedir = (m: M) => !/SELECCI/i.test(m.comp || "") && !m.paid
  && !/^(SOLICITADO|PAGADO)/.test(m.fcvb_pago || "") && !/PLAZO SOLICITUD PAGO TERMINADO/.test(m.fcvb_pago || "")
  && !["procesando", "factura"].includes(m.fcvb_accion || "")
  && (m.fcvb_tarifa == null || (+m.fcvb_tarifa + +(m.fcvb_gastos || 0)) > 0);

export async function avisoCobros(db: Db) {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date()), noon = Date.parse(`${today}T12:00:00Z`);
  const mon = new Date(noon - ((new Date(noon).getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10), key = `domingo:${mon}`;
  const { data: ps } = await db.from("profiles").select("user_id").neq("tipo", "deportista");
  const arbitros = new Set((ps || []).map((p: { user_id: string }) => p.user_id));
  const { data: ms } = await db.from("matches").select("user_id, comp, paid, fcvb_pago, fcvb_accion, fcvb_tarifa, fcvb_gastos").gte("date", mon).lte("date", today);
  const n = new Map<string, number>();
  for (const m of (ms || []) as M[]) if (arbitros.has(m.user_id) && porPedir(m)) n.set(m.user_id, (n.get(m.user_id) || 0) + 1);
  let enviados = 0;
  for (const [u, k] of n) {
    const { data: done } = await db.from("push_log").select("key").eq("user_id", u).eq("key", key).maybeSingle();
    if (done) continue;
    await sendToUser(db, u, (t) => ({ ...t.domingo(k), tag: "domingo", url: "./?vista=cobros" }), key);
    enviados++;
  }
  return { semana: mon, arbitros: arbitros.size, conPendientes: n.size, enviados };
}
