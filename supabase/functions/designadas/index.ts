// Panel de administración: qué categorías tienen ya partidos designados esta semana, de lunes a domingo (toda la FCVB),
// partidos sin árbitro de aquí al domingo y salud de la app. Solo para los usuarios del secret ADMIN_LOGINS (ver _shared/admin.ts). Fuente pública: la ficha de "próximos partidos que arbitrará" de
// cada árbitro (partidos_arbitro.php, ~0,5 KB; la de toda la federación da error 500), cruzada con el listado de
// partidos de la federación para saber la categoría. Resultado en caché 1 h ({refresh:true} para forzarlo).
import { admin, background, cors, json, userFromRequest } from "../_shared/sync.ts";
import { arbitrosPublicos, cached, feed, FICHA_VALE, fixMojibake, getLatin, idPartido, matchOfficials, norm, type Partido, PUB } from "../_shared/publico.ts";
import { adminIds, adminLogins, esAdmin } from "../_shared/admin.ts";
import { madridNow, sendToUser } from "../_shared/push.ts";
import { todas } from "../_shared/db.ts";

const MESES: Record<string, string> = { enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06", julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10", noviembre: "11", diciembre: "12" };
const txt = (s: string) => fixMojibake(s.replace(/<br\s*\/?>/gi, " · ").replace(/<[^>]+>/g, " ")).replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// "domingo 25 de octubre a las 16:00" → "2026-10-25 16:00" (año: el de la fecha más cercana hacia delante).
function parseFecha(s: string) {
  const m = norm(s).match(/(\d{1,2}) DE ([A-Z]+) A LAS (\d{1,2}):(\d{2})/); if (!m) return "";
  const mm = MESES[m[2].toLowerCase()]; if (!mm) return "";
  const now = new Date(); let y = now.getFullYear();
  if (+mm < now.getMonth() + 1 - 6) y++;
  return `${y}-${mm}-${m[1].padStart(2, "0")} ${m[3].padStart(2, "0")}:${m[4]}`;
}

// Competición en catalán de iSquad → categoría del listado de partidos ("SEGUNDA DIVISION CADETE FEMENINO").
function compToCat(comp: string) {
  const c = norm(comp);
  const age = /\bSEN/.test(c) ? "SENIOR" : /\bJUN/.test(c) ? "JUNIOR" : /\bJUV/.test(c) ? "JUVENIL" : /\bCAD/.test(c) ? "CADETE" : /\bINF/.test(c) ? "INFANTIL" : /\bALEV/.test(c) ? "ALEVIN" : /AMATEUR/.test(c) ? "AMATEUR" : "";
  const gen = /\bFEM/.test(c) ? "FEMENINO" : /\bMASC/.test(c) ? "MASCULINO" : /\bMIXT/.test(c) ? "MIXTO" : "";
  const div = c.match(/\b(\d)A DIV/)?.[1];
  const divTxt = div ? ["", "PRIMERA", "SEGUNDA", "TERCERA", "CUARTA"][+div] + " DIVISION" : /PREFERENT/.test(c) ? "PREFERENTE" : "";
  if (age === "ALEVIN") return "ALEVIN";
  if (age === "AMATEUR") return `AMATEUR ${divTxt} ${gen}`.replace(/\s+/g, " ").trim();
  return age && divTxt ? `${divTxt} ${age} ${gen}`.replace(/\s+/g, " ").trim() : "";
}

// deno-lint-ignore no-explicit-any
type Db = any;
// pendientes: partidos de la semana (categorías de liga) que no salen en ninguna ficha de árbitro; los usa sinArbitro.
type Pendiente = { d: string; l: string; v: string; cat: string; pab: string; pista: string };
type Resultado = { actualizado: string; desde: string; hasta: string; arbitros: number; leidos: number; errores: number; designados: number; partidos: number;
  categorias: { cat: string; total: number; desig: number }[]; otras: { comp: string; n: number }[]; pendientes?: Pendiente[] };
const relevante = (cat: string) => !/ALEVI|AMATEUR|MASTER|VETERA|BENJAMI/.test(norm(cat));
const nombreCat = (cat: string) => { const c = norm(cat), d = c.match(/^(PRIMERA|SEGUNDA|TERCERA|CUARTA) DIVISION/)?.[1];
  const div = d ? ({ PRIMERA: "1ª", SEGUNDA: "2ª", TERCERA: "3ª", CUARTA: "4ª" } as Record<string, string>)[d] : /PREFERENTE/.test(c) ? "Preferente" : "";
  const age = /SENIOR/.test(c) ? "Sénior" : /JUNIOR/.test(c) ? "Júnior" : /JUVENIL/.test(c) ? "Juvenil" : /CADETE/.test(c) ? "Cadete" : /INFANTIL/.test(c) ? "Infantil" : "";
  const gen = /FEMENINO/.test(c) ? "Femenino" : /MASCULINO/.test(c) ? "Masculino" : /MIXTO/.test(c) ? "Mixto" : "";
  return [div, age, gen].filter(Boolean).join(" ") || cat; };

// Cron (cada hora de 8 a 22): recalcula y avisa a los admins de las categorías que han empezado a tener designaciones
// esta semana, y de si la app tiene problemas (salud).
async function cron(db: Db) {
  const now = madridNow();
  if (now.hour < 8 || now.hour > 22) return { skipped: "noche" };
  await db.from("pub_cache").delete().eq("key", "desig-global");
  const r = await calcular(db);
  const admins = await adminIds(db);
  const snapKey = `desig-snap:${r.hasta}`;
  const { data: prev } = await db.from("pub_cache").select("data").eq("key", snapKey).maybeSingle();
  const nuevas: string[] = [];
  if (prev) {
    const before = new Map((prev.data as { cat: string; desig: number }[]).map((c) => [c.cat, c.desig]));
    for (const c of r.categorias) if (relevante(c.cat) && c.desig > 0 && !(before.get(c.cat) || 0)) nuevas.push(`${nombreCat(c.cat)} (${c.desig}/${c.total})`);
  }
  await db.from("pub_cache").upsert({ key: snapKey, data: r.categorias.map(({ cat, desig }) => ({ cat, desig })), fetched_at: new Date().toISOString() });
  if (nuevas.length) for (const a of admins) await sendToUser(db, a, (t) => ({ ...t.designaciones(nuevas), tag: "designaciones", url: "./?vista=admin" }));
  const designan = await avisoDesignan(db, r, (prev?.data || []) as { cat: string; desig: number }[]);
  const salud = await revisarSalud(db, admins);
  return { nuevas, designan, salud };
}

// "Ep! Han empezado a designar": a todos los árbitros (salvo quien lo quita en Ajustes), una vez por semana, cuando ya hay
// al menos MIN_DESIGNAN partidos designados de la semana en las categorías de liga (una designación suelta adelantada no cuenta).
// Solo al pasar de menos a MIN_DESIGNAN o más respecto a la pasada anterior (sin pasada anterior, la semana empieza en 0).
// Va a la campana de todos y como notificación a quien la tiene activada. push_log designan:<lunes>.
const MIN_DESIGNAN = 3;
async function avisoDesignan(db: Db, r: Resultado, antes: { cat: string; desig: number }[]) {
  const suma = (cs: { cat: string; desig: number }[]) => cs.filter((c) => relevante(c.cat)).reduce((t, c) => t + c.desig, 0);
  if (suma(r.categorias) < MIN_DESIGNAN || suma(antes) >= MIN_DESIGNAN) return 0;
  const key = `designan:${r.desde}`;
  const ya = new Set((await todas<{ user_id: string }>(() => db.from("push_log").select("user_id").eq("key", key).order("user_id"))).map((x) => x.user_id));
  const arbitros = await todas<{ user_id: string }>(() => db.from("profiles").select("user_id").eq("tipo", "arbitro").eq("aviso_designan", true).order("user_id"));
  let enviados = 0;
  for (const { user_id } of arbitros) {
    if (ya.has(user_id)) continue;
    await sendToUser(db, user_id, (t) => ({ ...t.designan(), tag: "designan", url: "./?vista=agenda" }), key);
    enviados++;
  }
  return enviados;
}

// Salud: si muchos árbitros fallan a la vez (p. ej. iSquad cambia el login) o el sync automático no funciona, aviso a
// los admins (como mucho uno cada 6 h por motivo).
async function revisarSalud(db: Db, admins: string[]) {
  const ps = await todas<{ last_sync: string | null; last_error: string | null }>(() => db.from("profiles").select("last_sync, last_error").neq("tipo", "deportista").order("user_id"));
  const total = ps?.length || 0, conError = (ps || []).filter((p: { last_error: string | null }) => p.last_error).length;
  const ultimo = Math.max(0, ...(ps || []).map((p: { last_sync: string | null }) => p.last_sync ? Date.parse(p.last_sync) : 0));
  const problemas: ({ fallan: number; total: number } | { horas: number })[] = [];
  if (total >= 3 && conError * 2 >= total) problemas.push({ fallan: conError, total });
  if (ultimo && Date.now() - ultimo > 13 * 3600_000) problemas.push({ horas: Math.round((Date.now() - ultimo) / 3600_000) });
  for (const p of problemas) {
    const key = `salud-aviso:${"fallan" in p ? "login" : "sync"}`;
    const { data: last } = await db.from("pub_cache").select("fetched_at").eq("key", key).maybeSingle();
    if (last && Date.now() - Date.parse(last.fetched_at) < 6 * 3600_000) continue;
    for (const a of admins) await sendToUser(db, a, (t) => ({ ...t.salud(p), tag: "salud", url: "./?vista=admin" }));
    await db.from("pub_cache").upsert({ key, data: { p }, fetched_at: new Date().toISOString() });
  }
  return { total, conError, problemas };
}

// Panel de salud para el admin: usuarios y errores, avisos activados, índice de plantillas, edad de las cachés y uso
// (cuentas que han abierto la app en 7 días, avisos mandados en 7 días, logins a iSquad por día).
async function salud(db: Db) {
  const hace7 = new Date(Date.now() - 7 * 864e5).toISOString();
  const { count: activos7 } = await db.from("profiles").select("user_id", { count: "exact", head: true }).gte("last_active", hace7);
  const { count: avisos7 } = await db.from("push_log").select("user_id", { count: "exact", head: true }).gte("sent_at", hace7);
  const { data: logins } = await db.from("pub_cache").select("key, data").like("key", "logins:%").order("key", { ascending: false }).limit(7);
  const ps = await todas<{ user_id: string; tipo: string; last_sync: string | null; last_error: string | null; created_at: string }>(() => db.from("profiles").select("user_id, tipo, last_sync, last_error, created_at").order("created_at").order("user_id"));
  const subs = await todas<{ user_id: string; last_sent: string | null }>(() => db.from("push_subs").select("user_id, last_sent").order("endpoint"));
  const { count: equipos } = await db.from("pub_teams").select("id_equipo", { count: "exact", head: true });
  const { count: revisados } = await db.from("pub_teams").select("id_equipo", { count: "exact", head: true }).not("checked_at", "is", null);
  const { data: caches } = await db.from("pub_cache").select("key, fetched_at").in("key", ["feed", "clubs", "arbitros", "desig-global"]);
  const { data: snaps } = await db.from("pub_cache").select("fetched_at").like("key", "snap:%").order("fetched_at", { ascending: false }).limit(1);
  // Sin nombres ni emails: cada cuenta, con un id corto (los 6 primeros caracteres de su user_id).
  const usuarios = (ps || []).map((p: { user_id: string; tipo: string; last_sync: string | null; last_error: string | null; created_at: string }) => ({
    id: p.user_id.slice(0, 6), tipo: p.tipo, last_sync: p.last_sync, last_error: p.last_error, alta: p.created_at,
    avisos: (subs || []).filter((s: { user_id: string }) => s.user_id === p.user_id).length }));
  return {
    usuarios, dispositivos: subs?.length || 0, indice: { equipos: equipos || 0, revisados: revisados || 0 },
    activos7: activos7 || 0, avisos7: avisos7 || 0, admins: adminLogins().length,
    logins: (logins || []).map((l: { key: string; data: { n?: number } }) => ({ dia: l.key.slice(7), n: l.data?.n || 0 })),
    cache: Object.fromEntries((caches || []).map((c: { key: string; fetched_at: string }) => [c.key, c.fetched_at])),
    vigilancia: snaps?.[0]?.fetched_at || null,
  };
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") === secret) return json(await cron(db));
  const user = await userFromRequest(db, req);
  if (!user) return json({ error: "Inicia sesión de nuevo" }, 401);
  if (!(await esAdmin(db, user.id))) return json({ error: "No disponible" }, 403);
  let body: { refresh?: boolean; action?: string } = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }
  if (body.action === "admin") return json({ ok: true });   // la web solo pregunta si enseña los paneles
  if (body.action === "salud") return json({ ok: true, ...(await salud(db)) });
  if (body.action === "sin-arbitro") return json({ ok: true, ...(await sinArbitro(db, !!body.refresh, t0)) });
  if (body.refresh) await db.from("pub_cache").delete().eq("key", "desig-global");

  return json({ ok: true, ...(await calcular(db)) });
});

function calcular(db: Db, force = false): Promise<Resultado> {
  const started = Date.now();
  return cached(db, "desig-global", force ? 0 : 3600_000, async () => {
    // Árbitros de la FCVB (ids de la lista pública), 7 días.
    const ids = [...new Set((await arbitrosPublicos(db)).map((a) => a.id))];
    // Designaciones de cada árbitro, de 10 en 10.
    const desig = new Map<string, { d: string; teams: string; comp: string }>();
    let ok = 0, fail = 0;
    const queue = [...ids];
    const worker = async () => {
      while (queue.length && Date.now() - started < 110_000) {
        const id = queue.shift()!;
        try {
          // iSquad da error 500 con todas las fichas (ver FICHA_VALE): desde el 27-oct-2026 contaban como fallo y el panel salía a 0.
          const s = await getLatin(`${PUB}/partidos_arbitro.php?id_arbitro=${id}&id_superficie=1`, FICHA_VALE); ok++;
          let comp = "";
          for (const tr of s.match(/<tr[\s\S]*?<\/tr>/g) || []) {
            const th = tr.match(/<th[^>]*>([\s\S]*?)<\/th>/); if (th) { comp = txt(th[1]).replace(/\s+-\s+(PRIMERA|SEGUNDA|TERCERA|FASE|FINAL|GRUP|GRUPO|LLIGA|JORNADA)[\s\S]*$/i, ""); continue; }
            if (!/class='warning'/.test(tr)) continue;
            const td = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => txt(x[1]));
            const d = parseFecha(td[1] || ""); if (!d) continue;
            desig.set(`${d}|${norm(td[0])}`, { d, teams: td[0], comp });
          }
        } catch { fail++; }
      }
    };
    await Promise.all(Array.from({ length: 10 }, worker));
    // Semana de lunes a domingo (hora de Madrid): hasta el domingo se sigue viendo la misma.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
    const day = (n: number) => new Date(Date.parse(today + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
    const back = (new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7, desde = day(-back), until = day(6 - back);
    // La ficha solo enseña los próximos partidos: las designaciones de días ya jugados se guardan de lecturas anteriores.
    const semKey = `desig-semana:${desde}`;
    const { data: prevSem } = await db.from("pub_cache").select("data").eq("key", semKey).maybeSingle();
    for (const [k, x] of Object.entries((prevSem?.data || {}) as Record<string, { d: string; teams: string; comp: string }>)) if (!desig.has(k)) desig.set(k, x);
    for (const k of [...desig.keys()]) { const d = desig.get(k)!.d.slice(0, 10); if (d < desde || d > until) desig.delete(k); }
    if (ok) await db.from("pub_cache").upsert({ key: semKey, data: Object.fromEntries(desig), fetched_at: new Date().toISOString() });
    // Partidos de la federación de la semana, por categoría (la del listado, con género).
    const list = (await feed(db)).filter((p) => p.d.slice(0, 10) >= desde && p.d.slice(0, 10) <= until);
    const cats = new Map<string, { cat: string; total: number; desig: number }>();
    const matched = new Set<string>();
    const pendientes: Pendiente[] = [];
    // El texto de la designación es "LOCAL - VISITANTE" (y los nombres pueden llevar guiones). Dos pasadas: primero los
    // dos nombres exactos y, con lo que quede, el local o el visitante (un club con dos equipos a la misma hora, si no, se
    // podía quedar con la designación del otro y dejar fuera de "pendientes" al que no tiene árbitro).
    const deP = new Map<Partido, string>();
    const cruza = (exacto: boolean) => { for (const p of list) {
      if (deP.has(p)) continue;
      const l = norm(p.l), v = norm(p.v);
      const key = [...desig.keys()].find((k) => { const x = desig.get(k)!; const t = norm(x.teams);
        return !matched.has(k) && x.d === p.d && (exacto ? t === `${l} - ${v}` : t.startsWith(l + " - ") || t.endsWith(" - " + v)); });
      if (key) { deP.set(p, key); matched.add(key); }
    } };
    cruza(true); cruza(false);
    for (const p of list) {
      const c = cats.get(p.cat) || cats.set(p.cat, { cat: p.cat, total: 0, desig: 0 }).get(p.cat)!;
      c.total++;
      if (deP.has(p)) c.desig++;
      else if (relevante(p.cat)) pendientes.push({ d: p.d, l: p.l, v: p.v, cat: p.cat, pab: p.pab, pista: p.pista });
    }
    // Designaciones que no se han podido cruzar con su partido: a su categoría por el nombre de la competición
    // ("1a DIV. SEN MASC" → PRIMERA DIVISION SENIOR MASCULINO); si tampoco, a "otras".
    const otras = new Map<string, number>();
    for (const [k, x] of desig) {
      if (matched.has(k)) continue;
      const cat = compToCat(x.comp), c = cat && cats.get(cat);
      if (c && c.desig < c.total) c.desig++; else otras.set(x.comp, (otras.get(x.comp) || 0) + 1);
    }
    return {
      actualizado: new Date().toISOString(), desde, hasta: until, arbitros: ids.length, leidos: ok, errores: fail,
      designados: desig.size, partidos: list.length,
      categorias: [...cats.values()], otras: [...otras].map(([comp, n]) => ({ comp, n })), pendientes,
    };
  });
}

// Partidos sin árbitro de aquí al domingo (categorías de liga): los de la semana que no salen en ninguna ficha de árbitro
// (calcular, caché de 1 h que el cron renueva cada hora de 8 a 22), confirmados uno a uno con su Previo público, que manda:
// la ficha puede no enseñar una designación, o el cruce por nombre fallar. Como mucho los MAX_REVISAR más cercanos (el lunes,
// con la semana sin designar, serían casi todos). Caché 30 min (5 si no dio tiempo a mirarlos todos); {refresh:true} la
// rehace y vuelve a leer los Previos.
const MAX_REVISAR = 60;
type SinArbitro = Pendiente & { id: string | null; estado: "sin" | "con" | "nd" };
async function sinArbitro(db: Db, refresh: boolean, t0: number) {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  const { data: g } = await db.from("pub_cache").select("data, fetched_at").eq("key", "desig-global").maybeSingle();
  const r = g?.data as Resultado | undefined;
  // Sin cálculo, de antes de existir "pendientes", de hace más de 2 h (de noche no hay cron) o de otra semana: se rehace en
  // segundo plano (~1 min, unas 454 fichas) y la web vuelve a preguntar. Uno a la vez: candado desig-calc de 3 min.
  if (!r?.pendientes || !r.hasta || r.hasta < hoy || Date.now() - Date.parse(g.fetched_at) > 2 * 3600_000) {
    const { data: lock } = await db.from("pub_cache").select("fetched_at").eq("key", "desig-calc").maybeSingle();
    if (!lock || Date.now() - Date.parse(lock.fetched_at) > 3 * 60_000) {
      await db.from("pub_cache").upsert({ key: "desig-calc", data: {}, fetched_at: new Date().toISOString() });
      background(calcular(db, true));
    }
    return { calculando: true };
  }
  if (!refresh) {
    const { data: c } = await db.from("pub_cache").select("data, fetched_at").eq("key", "sin-arbitro").maybeSingle();
    if (c && c.data?.hasta === r.hasta && Date.now() - Date.parse(c.fetched_at) < (c.data.incompleto ? 5 : 30) * 60_000) return c.data;
  }
  // "2026-10-30 20:00", hora de Madrid, comparable con las fechas del listado.
  const ahora = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date());
  const total = (await feed(db)).filter((p) => relevante(p.cat) && p.d >= ahora && p.d.slice(0, 10) <= r.hasta).length;
  const cand = r.pendientes.filter((p) => p.d >= ahora).sort((a, b) => a.d.localeCompare(b.d));
  const lista: SinArbitro[] = cand.slice(0, MAX_REVISAR).map((p) => ({ ...p, id: null, estado: "nd" }));
  const queue = [...lista];
  let intentados = 0;
  // Cada partido son como mucho 2 búsquedas (20 s) y un Previo (25 s): a partir de 70 s no se empieza ninguno más, para
  // acabar dentro de los ~150 s de la función. Lo que no se mira queda "nd" (Sin comprobar).
  const worker = async () => {
    while (queue.length && Date.now() - t0 < 70_000) {
      const x = queue.shift()!;
      intentados++;
      try {
        x.id = await idPartido(db, x.l, x.v, x.d, refresh);
        if (x.id) {
          const oficiales = await matchOfficials(db, x.id, false, refresh);
          x.estado = oficiales.some((o) => o.f === "r1" || o.f === "r2") ? "con" : "sin";
        }
      } catch { /* sin datos: queda "nd" (Sin comprobar) */ }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  const out = {
    actualizado: new Date().toISOString(), desde: r.desde, hasta: r.hasta, designaciones: r.actualizado, total,
    // revisados: los que se llegaron a intentar (incompleto = faltó tiempo); un error de iSquad deja el partido "nd".
    candidatos: cand.length, revisados: intentados, incompleto: intentados < lista.length,
    conArbitro: lista.filter((x) => x.estado === "con").length, partidos: lista.filter((x) => x.estado !== "con"),
  };
  await db.from("pub_cache").upsert({ key: "sin-arbitro", data: out, fetched_at: out.actualizado });
  return out;
}
