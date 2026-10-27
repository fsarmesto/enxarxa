// Vigilancia (cron cada 10 minutos, de 7:00 a 24:00 de Madrid) para avisar por notificación, solo a quien las tiene:
// 1) designaciones nuevas, cambiadas o quitadas: primero la ficha pública de cada árbitro suscrito (sin login, ~2 KB);
//    solo si ha cambiado (o no se le encuentra ficha) se lanza su sync rápido (función sync, modo quick), que entra en
//    iSquad con la sesión guardada o con login. Antes era un login por árbitro en cada pasada (hasta 102 al día).
// 3) el día que arbitra, 2 h después del último partido: "pide el pago antes de mañana" y la dieta que le corresponde
//    (que no se olvide de ponerla en la hoja de gastos). Una vez por día (pub_cache "aviso-cobro:").
// 2) partidos de los equipos donde juega o entrena (y que tiene en "Mis partidos"): horario confirmado, cambio de
//    fecha u hora y suspendidos, comparando el calendario de la API pública con la foto anterior (pub_cache "snap:").
import { admin, cors, json } from "../_shared/sync.ts";
import { huellaFicha, idArbitro, teamMatches, type PartidoEquipo } from "../_shared/publico.ts";
import { cap, madridNow, type MsgFn, sendToUser } from "../_shared/push.ts";
import { dietasDelDia } from "../_shared/dieta.ts";

type Snap = Pick<PartidoEquipo, "id" | "d" | "t" | "conf" | "est"> & { rl?: number | null; rv?: number | null };

// horarios = avisos de horario y suspendidos (equipos donde juega o entrena); los resultados, también de los que sigue.
// idEquipo: para saber si ha ganado o perdido.
export function teamChanges(prev: Snap[], now: PartidoEquipo[], idEquipo = "", horarios = true): MsgFn[] {
  const today = new Date().toISOString().slice(0, 10), before = new Map(prev.map((m) => [m.id, m])), out: MsgFn[] = [];
  const hora = (m: Snap) => (m.t && m.conf ? m.t : "");
  const hace7 = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  for (const m of now) {
    const p = before.get(m.id);
    if (!p) continue;
    // Resultado nuevo (issue #31): solo si la foto anterior ya guardaba resultados (las de antes no: avisaría de todos).
    if ("rl" in p && p.rl == null && m.rl != null && m.rv != null && m.d >= hace7) {
      const gana = m.idl === idEquipo ? m.rl > m.rv : m.idv === idEquipo ? m.rv > m.rl : null, rl = m.rl, rv = m.rv;
      out.push((t) => ({ ...t.eqResultado(cap(m.l), rl, rv, cap(m.v), gana, m.d), tag: `eqr-${m.id}`, url: "./?vista=equipos&avisos=1" }));
    }
    if (!horarios || m.d < today) continue;
    const vs = `${cap(m.l)} – ${cap(m.v)}`, base = { tag: `eq-${m.id}`, url: "./?vista=agenda" };
    if (/SUSPEN|APLAZ/i.test(m.est) && m.est !== p.est) out.push((t) => ({ ...base, ...t.eqEstado(vs, m.d, m.est) }));
    else if (!hora(p) && hora(m)) out.push((t) => ({ ...base, ...t.eqHorario(vs, m.d, m.t) }));
    else if (hora(m) && (p.d !== m.d || hora(p) !== hora(m))) out.push((t) => ({ ...base, ...t.eqCambioHorario(vs, m.d, m.t, p.d, hora(p)) }));
    else if (!hora(m) && p.d !== m.d) out.push((t) => ({ ...base, ...t.eqCambioFecha(vs, m.d, p.d) }));
  }
  return out;
}

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
    await sendToUser(db, u, (t) => ({ ...t.cobro(total, dietas.map((d) => d.franja), n), tag: `cobro-${today}`, url: "./?vista=cobros" }));
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

  // 1) Designaciones: ficha pública de cada árbitro; si cambia, una ejecución de sync para él (en una sola no caben
  //    la CPU ni la memoria de varios).
  const self = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sync`;
  const { data: profs } = await db.from("profiles").select("user_id, nombre, foto, id_arbitro").in("user_id", arbitros);
  // Con un partido que faltó en la última lectura (missing_since), hay que volver a mirar aunque la ficha no cambie.
  const { data: pend } = await db.from("matches").select("user_id").in("user_id", arbitros).not("missing_since", "is", null);
  const pendiente = new Set((pend || []).map((m: { user_id: string }) => m.user_id));
  let fichas = 0, syncs = 0;
  const desig = Promise.all(arbitros.map(async (user_id) => {
    try {
      const p = (profs || []).find((x: { user_id: string }) => x.user_id === user_id);
      let id: string | null = p?.id_arbitro || null;
      if (!id && p) { id = await idArbitro(db, p.nombre, p.foto).catch(() => null); if (id) await db.from("profiles").update({ id_arbitro: id }).eq("user_id", user_id); }
      if (id) {
        const h = await huellaFicha(id); fichas++;
        const key = `ficha:${user_id}`;
        const { data: old } = await db.from("pub_cache").select("data").eq("key", key).maybeSingle();
        if ((old?.data as { h?: string })?.h === h && !pendiente.has(user_id)) return 0;   // nada nuevo: sin entrar en iSquad
        // Se guarda antes del sync: si el sync falla, no se reintenta cada 10 minutos (el sync completo del cron sí lo hará).
        await db.from("pub_cache").upsert({ key, data: { h }, fetched_at: new Date().toISOString() });
      }
      syncs++;
      const r = await fetch(self, { method: "POST", body: JSON.stringify({ user_id, mode: "quick" }), signal: AbortSignal.timeout(90_000),
        headers: { "Content-Type": "application/json", "x-cron-secret": secret } });
      const j = await r.json(); return j?.avisos || 0;
    } catch { return 0; }
  }));

  // 2) Equipos de los suscritos (activos en "Mis partidos"): de los que juegan o entrenan, horarios y resultados; de los
  //    que solo siguen, solo resultados (issue #31).
  const { data: favs } = await db.from("fav_teams").select("user_id, id_equipo, team, rol, activo").in("user_id", users).eq("activo", true).eq("oculto", false).not("id_equipo", "is", null);
  const teams = new Map<string, { team: string; users: Set<string>; juegan: Set<string> }>();
  for (const f of favs || []) {
    const t = teams.get(f.id_equipo) || teams.set(f.id_equipo, { team: f.team, users: new Set(), juegan: new Set() }).get(f.id_equipo)!;
    t.users.add(f.user_id); if (f.rol) t.juegan.add(f.user_id);
  }
  let teamMsgs = 0;
  const queue = [...teams];
  const worker = async () => {
    while (queue.length && Date.now() - started < 100_000) {
      const [id, t] = queue.shift()!;
      try {
        // Calendario recién leído (y la app lo ve al momento) si alguien juega o entrena en él; si solo lo siguen, la caché.
        if (t.juegan.size) await db.from("pub_cache").delete().eq("key", `tm2:${id}`);
        const cal = await teamMatches(db, id, t.team);
        const { data: snap } = await db.from("pub_cache").select("data").eq("key", `snap:${id}`).maybeSingle();
        if (snap) for (const u of t.users) for (const msg of teamChanges(snap.data as Snap[], cal, id, t.juegan.has(u)).slice(0, 5)) {
          teamMsgs++; await sendToUser(db, u, msg);
        }
        await db.from("pub_cache").upsert({ key: `snap:${id}`, data: cal.map(({ id, d, t, conf, est, rl, rv }) => ({ id, d, t, conf, est, rl, rv })), fetched_at: new Date().toISOString() });
      } catch { /* la próxima pasada */ }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const desigMsgs = (await desig).reduce((a, b) => a + b, 0);
  const cobro = await avisoCobro(db, arbitros).catch(() => 0);
  return json({ users: users.length, fichas, syncs, equipos: teams.size, avisos: { designaciones: desigMsgs, equipos: teamMsgs, cobro }, ms: Date.now() - started });
});
