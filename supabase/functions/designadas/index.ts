// Panel de administración: qué categorías tienen ya partidos designados esta semana, de lunes a domingo (toda la FCVB).
// Solo para los usuarios del secret ADMIN_LOGINS. Fuente pública: la ficha de "próximos partidos que arbitrará" de
// cada árbitro (partidos_arbitro.php, ~0,5 KB; la de toda la federación da error 500), cruzada con el listado de
// partidos de la federación para saber la categoría. Resultado en caché 1 h ({refresh:true} para forzarlo).
import { admin, cors, json, userFromRequest } from "../_shared/sync.ts";
import { arbitrosPublicos, cached, feed, fixMojibake, getLatin, norm, PUB } from "../_shared/publico.ts";
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
type Resultado = { actualizado: string; desde: string; hasta: string; arbitros: number; leidos: number; errores: number; designados: number; partidos: number;
  categorias: { cat: string; total: number; desig: number }[]; otras: { comp: string; n: number }[] };

async function adminIds(db: Db): Promise<string[]> {
  const admins = (Deno.env.get("ADMIN_LOGINS") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!admins.length) return [];
  const { data } = await db.from("profiles").select("user_id").in("login_key", admins);
  return (data || []).map((x: { user_id: string }) => x.user_id);
}
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
  if (nuevas.length) for (const a of admins) await sendToUser(db, a, (t) => ({ ...t.designaciones(nuevas), tag: "designaciones", url: "./?vista=cobros" }));
  const salud = await revisarSalud(db, admins);
  return { nuevas, salud };
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
    for (const a of admins) await sendToUser(db, a, (t) => ({ ...t.salud(p), tag: "salud", url: "./?vista=cobros" }));
    await db.from("pub_cache").upsert({ key, data: { p }, fetched_at: new Date().toISOString() });
  }
  return { total, conError, problemas };
}

// Panel de salud para el admin: usuarios y errores, avisos activados, índice de plantillas y edad de las cachés.
async function salud(db: Db) {
  const ps = await todas<{ user_id: string; tipo: string; last_sync: string | null; last_error: string | null; created_at: string }>(() => db.from("profiles").select("user_id, tipo, last_sync, last_error, created_at").order("created_at").order("user_id"));
  const subs = await todas<{ user_id: string; last_sent: string | null }>(() => db.from("push_subs").select("user_id, last_sent").order("endpoint"));
  const { count: equipos } = await db.from("pub_teams").select("id_equipo", { count: "exact", head: true });
  const { count: revisados } = await db.from("pub_teams").select("id_equipo", { count: "exact", head: true }).not("checked_at", "is", null);
  const { data: caches } = await db.from("pub_cache").select("key, fetched_at").in("key", ["feed", "token", "clubs", "arbitros", "desig-global"]);
  const { data: snaps } = await db.from("pub_cache").select("fetched_at").like("key", "snap:%").order("fetched_at", { ascending: false }).limit(1);
  // Sin nombres ni emails: cada cuenta, con un id corto (los 6 primeros caracteres de su user_id).
  const usuarios = (ps || []).map((p: { user_id: string; tipo: string; last_sync: string | null; last_error: string | null; created_at: string }) => ({
    id: p.user_id.slice(0, 6), tipo: p.tipo, last_sync: p.last_sync, last_error: p.last_error, alta: p.created_at,
    avisos: (subs || []).filter((s: { user_id: string }) => s.user_id === p.user_id).length }));
  return {
    usuarios, dispositivos: subs?.length || 0, indice: { equipos: equipos || 0, revisados: revisados || 0 },
    cache: Object.fromEntries((caches || []).map((c: { key: string; fetched_at: string }) => [c.key, c.fetched_at])),
    vigilancia: snaps?.[0]?.fetched_at || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") === secret) return json(await cron(db));
  const user = await userFromRequest(db, req);
  if (!user) return json({ error: "Inicia sesión de nuevo" }, 401);
  const admins = (Deno.env.get("ADMIN_LOGINS") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const { data: me } = await db.from("profiles").select("login_key").eq("user_id", user.id).maybeSingle();
  if (!me || !admins.includes(me.login_key)) return json({ error: "No disponible" }, 403);
  let body: { refresh?: boolean; action?: string } = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }
  if (body.action === "admin") return json({ ok: true });   // la web solo pregunta si enseña los paneles
  if (body.action === "salud") return json({ ok: true, ...(await salud(db)) });
  if (body.refresh) await db.from("pub_cache").delete().eq("key", "desig-global");

  return json({ ok: true, ...(await calcular(db)) });
});

function calcular(db: Db): Promise<Resultado> {
  const started = Date.now();
  return cached(db, "desig-global", 3600_000, async () => {
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
          const s = await getLatin(`${PUB}/partidos_arbitro.php?id_arbitro=${id}&id_superficie=1`); ok++;
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
    for (const p of list) {
      const c = cats.get(p.cat) || cats.set(p.cat, { cat: p.cat, total: 0, desig: 0 }).get(p.cat)!;
      c.total++;
      // El texto de la designación es "LOCAL - VISITANTE" (y los nombres pueden llevar guiones): por el local o el visitante.
      const key = [...desig.keys()].find((k) => { const x = desig.get(k)!; const t = norm(x.teams);
        return !matched.has(k) && x.d === p.d && (t.startsWith(norm(p.l) + " - ") || t.endsWith(" - " + norm(p.v))); });
      if (key) { c.desig++; matched.add(key); }
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
      categorias: [...cats.values()], otras: [...otras].map(([comp, n]) => ({ comp, n })),
    };
  });
}
