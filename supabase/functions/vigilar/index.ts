// Vigilancia (cron cada 10 minutos, de 7:00 a 24:00 de Madrid) para avisar por notificación, solo a quien las tiene:
// 1) designaciones nuevas, cambiadas o anuladas: sync rápido de cada árbitro suscrito (función sync, modo quick);
// 3) el día que arbitra, 2 h después del último partido: "pide el pago antes de mañana" y la dieta que le corresponde
//    (que no se olvide de ponerla en la hoja de gastos). Una vez por día (pub_cache "aviso-cobro:").
// 2) partidos de los equipos donde juega o entrena (y que tiene en "Mis partidos"): horario confirmado, cambio de
//    fecha u hora y suspendidos, comparando el calendario de la API pública con la foto anterior (pub_cache "snap:").
import { admin, cors, json } from "../_shared/sync.ts";
import { teamMatches, type PartidoEquipo } from "../_shared/publico.ts";
import { cap, madridNow, type Msg, sendToUser, shortDate } from "../_shared/push.ts";
import { dietasDelDia } from "../_shared/dieta.ts";

type Snap = Pick<PartidoEquipo, "id" | "d" | "t" | "conf" | "est">;

export function teamChanges(prev: Snap[], now: PartidoEquipo[]): Msg[] {
  const today = new Date().toISOString().slice(0, 10), before = new Map(prev.map((m) => [m.id, m])), out: Msg[] = [];
  const hora = (m: Snap) => (m.t && m.conf ? m.t : "");
  for (const m of now) {
    const p = before.get(m.id);
    if (!p || m.d < today) continue;
    const vs = `${cap(m.l)} – ${cap(m.v)}`, base = { tag: `eq-${m.id}`, url: "./?vista=agenda" };
    if (/SUSPEN|APLAZ/i.test(m.est) && m.est !== p.est) out.push({ ...base, title: `Partido ${m.est.toLowerCase()} · ${shortDate(m.d)}`, body: vs });
    else if (!hora(p) && hora(m)) out.push({ ...base, title: `Ya hay horario · ${shortDate(m.d)} a las ${m.t}`, body: vs });
    else if (hora(m) && (p.d !== m.d || hora(p) !== hora(m))) out.push({ ...base, title: `Cambio de horario · ${shortDate(m.d)} a las ${m.t}`, body: `${vs} (antes ${shortDate(p.d)}${hora(p) ? " a las " + hora(p) : ""})` });
    else if (!hora(m) && p.d !== m.d) out.push({ ...base, title: `Cambio de fecha · ${shortDate(m.d)}`, body: `${vs} (antes ${shortDate(p.d)}), hora por confirmar` });
  }
  return out;
}

const eur = (v: number) => v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
// deno-lint-ignore no-explicit-any
async function avisoCobro(db: any, users: string[]) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  const today = `${p.year}-${p.month}-${p.day}`, now = (+p.hour % 24) * 60 + +p.minute;
  const { data: ms } = await db.from("matches").select("user_id, date, time, comp, phase, cat, holiday, no_dieta, dieta_override, fcvb_pago, fcvb_accion")
    .in("user_id", users).eq("date", today);
  const byUser = new Map<string, typeof ms>();
  for (const m of ms || []) if (!/SELECCI/i.test(m.comp || "")) (byUser.get(m.user_id) || byUser.set(m.user_id, []).get(m.user_id)!).push(m);
  let sent = 0;
  for (const [u, list] of byUser) {
    const last = Math.max(...list.map((m: { time: string }) => { const [h, mi] = m.time.split(":").map(Number); return h * 60 + mi; }));
    if (now < last + 120) continue;                                                     // aún jugando
    if (list.every((m: { fcvb_pago: string | null; fcvb_accion: string | null }) => /^(SOLICITADO|PAGADO)/.test(m.fcvb_pago || "") || m.fcvb_accion === "procesando")) continue;
    const key = `aviso-cobro:${u}:${today}`;
    const { data: done } = await db.from("pub_cache").select("key").eq("key", key).maybeSingle();
    if (done) continue;
    const dietas = dietasDelDia(list), total = dietas.reduce((a, d) => a + d.importe, 0), n = list.length;
    const msg: Msg = {
      title: "Pide el pago de hoy antes de mañana",
      body: total > 0
        ? `Te corresponde dieta: ${eur(total)} (${dietas.map((d) => d.franja).join(" y ")}). Ponla en la hoja de gastos de iSquad junto con el desplazamiento.`
        : `Pide la tarifa y el desplazamiento de ${n === 1 ? "tu partido" : `tus ${n} partidos`} de hoy en la hoja de gastos de iSquad.`,
      tag: `cobro-${today}`, url: "./?vista=cobros",
    };
    await sendToUser(db, u, msg);
    await db.from("pub_cache").upsert({ key, data: { total, n }, fetched_at: new Date().toISOString() });
    sent++;
  }
  return sent;
}

if (import.meta.main) Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "No autorizado" }, 401);
  let body: { force?: boolean } = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }
  const now = madridNow();
  if (!body.force && now.hour < 7) return json({ skipped: "noche", madrid: now });
  const db = admin(), started = Date.now();

  const { data: subs } = await db.from("push_subs").select("user_id");
  const users = [...new Set((subs || []).map((s: { user_id: string }) => s.user_id))];
  // Designaciones y aviso de cobro solo para árbitros; los equipos, para todos.
  const { data: deps } = await db.from("profiles").select("user_id").eq("tipo", "deportista").in("user_id", users);
  const arbitros = users.filter((u) => !(deps || []).some((d: { user_id: string }) => d.user_id === u));
  if (!users.length) return json({ users: 0 });

  // 1) Designaciones: una ejecución de sync por árbitro (en una sola no caben la CPU ni la memoria de varios).
  const self = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sync`;
  const desig = Promise.all(arbitros.map(async (user_id) => {
    try {
      const r = await fetch(self, { method: "POST", body: JSON.stringify({ user_id, mode: "quick" }), signal: AbortSignal.timeout(90_000),
        headers: { "Content-Type": "application/json", "x-cron-secret": secret } });
      const j = await r.json(); return j?.avisos || 0;
    } catch { return 0; }
  }));

  // 2) Equipos donde juegan o entrenan los suscritos (activos en "Mis partidos").
  const { data: favs } = await db.from("fav_teams").select("user_id, id_equipo, team, rol, activo").in("user_id", users).eq("activo", true).eq("oculto", false).not("rol", "is", null).not("id_equipo", "is", null);
  const teams = new Map<string, { team: string; users: Set<string> }>();
  for (const f of favs || []) {
    const t = teams.get(f.id_equipo) || teams.set(f.id_equipo, { team: f.team, users: new Set() }).get(f.id_equipo)!;
    t.users.add(f.user_id);
  }
  let teamMsgs = 0;
  const queue = [...teams];
  const worker = async () => {
    while (queue.length && Date.now() - started < 100_000) {
      const [id, t] = queue.shift()!;
      try {
        await db.from("pub_cache").delete().eq("key", `tm:${id}`); // calendario recién leído (y la app lo ve al momento)
        const cal = await teamMatches(db, id, t.team);
        const { data: snap } = await db.from("pub_cache").select("data").eq("key", `snap:${id}`).maybeSingle();
        if (snap) for (const msg of teamChanges(snap.data as Snap[], cal).slice(0, 5)) {
          teamMsgs++; for (const u of t.users) await sendToUser(db, u, msg);
        }
        await db.from("pub_cache").upsert({ key: `snap:${id}`, data: cal.map(({ id, d, t, conf, est }) => ({ id, d, t, conf, est })), fetched_at: new Date().toISOString() });
      } catch { /* la próxima pasada */ }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const desigMsgs = (await desig).reduce((a, b) => a + b, 0);
  const cobro = await avisoCobro(db, arbitros).catch(() => 0);
  return json({ users: users.length, equipos: teams.size, avisos: { designaciones: desigMsgs, equipos: teamMsgs, cobro }, ms: Date.now() - started });
});
