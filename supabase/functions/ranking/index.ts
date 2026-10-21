// Ranking de todos los árbitros de la app (partidos, cobros, designaciones). Solo para los usuarios de iSquad que
// estén en el secret ADMIN_LOGINS (separados por comas); a los demás, 403.
import { admin, cors, json, userFromRequest } from "../_shared/sync.ts";

const season = (d: string) => { const y = +d.slice(0, 4), m = +d.slice(5, 7); return String(m >= 8 ? y : y - 1); };
const territorial = (comp: string) => /SELECCI/i.test(comp || "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const user = await userFromRequest(db, req);
  if (!user) return json({ error: "Inicia sesión de nuevo" }, 401);
  const admins = (Deno.env.get("ADMIN_LOGINS") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const { data: me } = await db.from("profiles").select("login_key").eq("user_id", user.id).maybeSingle();
  if (!me || !admins.includes(me.login_key)) return json({ error: "No disponible" }, 403);

  const { data: profs } = await db.from("profiles").select("user_id, nombre, isquad_login, origin, created_at, last_sync");
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("matches")
      .select("user_id, date, time, comp, role, staff_checked, fcvb_tarifa, fcvb_gastos, fcvb_pago")
      .order("user_id").order("id").range(from, from + 999);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  // Por árbitro y temporada.
  type Acc = { partidos: number; jornadas: Set<string>; r1: number; r2: number; an: number; jl: number;
    liquidado: number; cobrado: number; solicitado: number; perdido: number; tarifa: number; gastos: number };
  const acc = new Map<string, Acc>();
  for (const m of rows as { user_id: string; date: string; time: string; comp: string; role: string; staff_checked: string | null;
    fcvb_tarifa: number | null; fcvb_gastos: number | null; fcvb_pago: string | null }[]) {
    const t = +(m.fcvb_tarifa ?? 0), g = +(m.fcvb_gastos ?? 0);
    if (territorial(m.comp) && !(g > 0)) continue;
    const k = `${m.user_id}|${season(m.date)}`;
    let a = acc.get(k);
    if (!a) acc.set(k, a = { partidos: 0, jornadas: new Set(), r1: 0, r2: 0, an: 0, jl: 0, liquidado: 0, cobrado: 0, solicitado: 0, perdido: 0, tarifa: 0, gastos: 0 });
    if (!territorial(m.comp)) {
      a.partidos++; a.jornadas.add(m.date + (m.time < "15:00" ? "M" : "T"));
      if (m.staff_checked && m.role in a) (a as unknown as Record<string, number>)[m.role]++;
    }
    if (m.fcvb_tarifa == null) continue;
    const p = m.fcvb_pago || "";
    a.liquidado += t + g; a.tarifa += t; a.gastos += g;
    if (/^PAGADO/.test(p)) a.cobrado += t + g;
    else if (/^SOLICITADO/.test(p)) a.solicitado += t + g;
    else if (/PLAZO SOLICITUD PAGO TERMINADO/.test(p)) a.perdido += t + g;
  }
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const out = (profs || []).map((p) => ({
    nombre: p.nombre || p.isquad_login, login: p.isquad_login, origen: p.origin, alta: p.created_at, last_sync: p.last_sync,
    temporadas: Object.fromEntries([...acc].filter(([k]) => k.startsWith(p.user_id + "|")).map(([k, a]) => [k.split("|")[1], {
      partidos: a.partidos, jornadas: a.jornadas.size, r1: a.r1, r2: a.r2, an: a.an, jl: a.jl,
      liquidado: r2(a.liquidado), cobrado: r2(a.cobrado), solicitado: r2(a.solicitado), perdido: r2(a.perdido), tarifa: r2(a.tarifa), gastos: r2(a.gastos),
    }])),
  }));
  return json({ ok: true, arbitros: out });
});
