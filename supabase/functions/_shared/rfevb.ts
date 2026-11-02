// Competiciones estatales de la RFEVB (Superliga, Liga Iberdrola, Superliga 2 y Primera División "Nacional"), 2-nov-2026.
// Su resultado no sale en la web de la FCVB. Fuente: la API pública que usa esvoley.es para pintar cada grupo
// (intranet.esvoley.es/api/competiciones, JSON en utf-8, sin login):
// - getJornadasCalendario?grupoId=: todas las jornadas con sus partidos (id, fecha, hora, equipos, pabellón; sin resultado).
// - getPartidosByJornada?jornadaId=: los partidos de una jornada con resultado, sets, árbitros (arb1-arb4) y pabellón.
// - getPartido?partidoId=: un partido, además con la foto del acta (imagenActa).
// - getClasificacionGrupo?grupoId= y getDatosGrupoCompeticion?grupoId= (competición, fase, grupo).
// La lista de grupos no la da la API: cada página de grupo de esvoley.es lleva su id (<input id="HiddenGrupoId">).
// Se descubren solos una vez por semana desde los índices de competiciones (así cambian solos de temporada); si la web
// falla, los de 2026/27. Equipos: id "rfevb:<id>" (el del escudo de la temporada), partidos "rfevb:<id>", grupos
// (torneo) "rfevb:<grupoId>": así pasan por las mismas funciones que los de la FCVB (Equipos, avisos, iCal).
import { cached, H, norm, UA, type Db, type FilaClasif, type Oficial, type PartidoEquipo } from "./publico.ts";

const API = "https://intranet.esvoley.es/api/competiciones", WEB = "https://esvoley.es";
// 2026/27, comprobados el 2-nov-2026 (por si esvoley.es no responde al descubrirlos).
const GRUPOS_2627 = [206, 213, 85, 86, 87, 224, 225, 226, 100, 101, 102, 103, 234, 235, 236, 237];

export type Grupo = { id: number; comp: string; fase: string; nombre: string; nivel: "sl" | "sl2" | "pn"; genero: "M" | "F" };
type PartidoApi = {
  id: number; fecha?: string | null; hora?: string | null; fecha_hora?: string | null; pabellon?: string | null; pista?: string | null;
  img_local?: string; img_visitante?: string; equipo_local: string; equipo_visitante: string;
  sets_local?: string; sets_visitante?: string; esAplazado?: boolean; esSuspendido?: boolean;
  arb1?: string; arb2?: string; arb3?: string; arb4?: string; imagenActa?: string | null;
  [k: string]: unknown;
};
type Jornada = { id: number; fecha: string; numero: string; partidos?: PartidoApi[] };

// De n en n a la vez (la API tarda ~3 s por calendario: los 16 grupos en serie eran ~60 s).
async function enTurnos<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) { const k = i++; out[k] = await f(xs[k]); } }));
  return out;
}

async function api<T>(path: string): Promise<T> {
  const r = await fetch(`${API}/${path}`, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`RFEVB ${r.status}`); }
  const j = await r.json();
  if (j?.Error?.HasError || j?.error?.hasError) throw new Error(`RFEVB: ${j?.Error?.Message || j?.error?.message || "error"}`);
  return j.content as T;
}

export function clasificaGrupo(comp: string): Pick<Grupo, "nivel" | "genero"> | null {
  const c = norm(comp);
  const genero = /IBERDROLA|FEMEN/.test(c) ? "F" : /MASC/.test(c) ? "M" : null;
  const nivel = /SUPERLIGA\s*(MASCULINA\s*|FEMENINA\s*)?2\b/.test(c) ? "sl2" : /SUPERLIGA|IBERDROLA/.test(c) ? "sl" : /PRIMERA DIVISION/.test(c) ? "pn" : null;
  return genero && nivel ? { nivel, genero } : null;
}

async function datosGrupo(id: number): Promise<Grupo | null> {
  const d = await api<{ competicion: string; fase: string; nombre: string }>(`getDatosGrupoCompeticion?grupoId=${id}`);
  const k = clasificaGrupo(d?.competicion || "");
  return k ? { id, comp: (d.competicion || "").trim(), fase: (d.fase || "").trim(), nombre: (d.nombre || "").trim(), ...k } : null;
}

// Grupos de la temporada en curso (caché 7 días).
export function grupos(db: Db): Promise<Grupo[]> {
  return cached(db, "rfevb-grupos", 7 * 24 * H, async () => {
    let ids: number[] = [];
    try {
      const paginas = new Set<string>();
      for (const s of ["competiciones-masculinas", "competiciones-femeninas"]) {
        const html = await (await fetch(`${WEB}/voleibol/${s}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) })).text();
        // Páginas de grupo de la temporada en curso (las de temporadas pasadas llevan "-2025-2026" en el nombre).
        for (const m of html.matchAll(new RegExp(`href="(/voleibol/${s}/(?!\\S*\\d{4}-\\d{4})[a-z0-9-]+/(?:grupo-[a-z]|clasificacion-y-resultados))"`, "g"))) paginas.add(m[1]);
      }
      for (const p of paginas) {
        const html = await (await fetch(`${WEB}${p}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) })).text();
        const id = +(html.match(/id="HiddenGrupoId"[^>]*value="(\d+)"/)?.[1] || 0);
        if (id && !ids.includes(id)) ids.push(id);
      }
    } catch (e) { console.error("rfevb grupos", (e as Error).message); }
    if (ids.length < 4) ids = GRUPOS_2627;
    const out: Grupo[] = [];
    for (const id of ids) { const g = await datosGrupo(id).catch(() => null); if (g) out.push(g); }
    if (!out.length) throw new Error("RFEVB: sin grupos");
    return out;
  });
}

// Nombre común de la competición (el de la RFEVB varía: "LIGA IBERDROLA", "SUPERLIGA FEMENINA 2", "PRIMERA DIVISION
// MASCULINA"): así la web la abrevia y filtra igual que las de iSquad (Superliga, Superliga 2, Nacional).
export const nombreComp = (g: Pick<Grupo, "nivel" | "genero">) =>
  `${{ sl: "SUPERLIGA", sl2: "SUPERLIGA 2", pn: "PRIMERA NACIONAL" }[g.nivel]} ${g.genero === "F" ? "FEMENINA" : "MASCULINA"}`;
const fechaIso = (f?: string | null) => { const m = (f || "").match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };
const horaDe = (p: PartidoApi) => (p.hora || p.fecha_hora?.match(/(\d{1,2}:\d{2})\s*$/)?.[1] || "").padStart(5, "0");
const escudo = (url?: string) => url?.match(/[?&]Id=(\d+)/i)?.[1] || "";
const sets = (p: PartidoApi) => { const l = +(p.sets_local || 0), v = +(p.sets_visitante || 0); return l + v > 0 ? [l, v] as const : null; };
const hoy = () => new Date().toISOString().slice(0, 10);

// Calendario de un grupo sin resultados (caché 6 h).
function calendario(db: Db, g: number): Promise<Jornada[]> {
  return cached(db, `rfevb-cal:${g}`, 6 * H, () => api<Jornada[]>(`getJornadasCalendario?grupoId=${g}`));
}
// Partidos de una jornada con resultado: las de hace más de 4 días casi no cambian (3 días); las recientes, 20 min.
function jornada(db: Db, j: Jornada): Promise<PartidoApi[]> {
  const vieja = fechaIso(j.fecha) < new Date(Date.now() - 4 * 864e5).toISOString().slice(0, 10);
  return cached(db, `rfevb-j:${j.id}`, vieja ? 72 * H : H / 3, () => api<PartidoApi[]>(`getPartidosByJornada?jornadaId=${j.id}`));
}
// Un partido, con el acta: si ya tiene resultado, 3 días; si no, 20 min.
export function partido(db: Db, id: string | number, jugado = false, force = false): Promise<PartidoApi> {
  return cached(db, `rfevb-p:${id}`, force ? 0 : jugado ? 72 * H : H / 3, () => api<PartidoApi>(`getPartido?partidoId=${id}`));
}

function aEquipo(p: PartidoApi, g: Grupo, j?: Jornada): PartidoEquipo & { pab: string } {
  const s = sets(p), t = horaDe(p);
  return {
    id: `rfevb:${p.id}`, d: fechaIso(p.fecha || p.fecha_hora), t: t === "00:00" ? "" : t, conf: t !== "00:00",
    est: p.esSuspendido ? "SUSPENDIDO" : p.esAplazado ? "APLAZADO" : s ? "Finalizado" : "Pendiente",
    l: (p.equipo_local || "").trim(), v: (p.equipo_visitante || "").trim(),
    idl: `rfevb:${escudo(p.img_local)}`, idv: `rfevb:${escudo(p.img_visitante)}`, rl: s ? s[0] : null, rv: s ? s[1] : null,
    j: j?.numero || "", g: /UNIC/i.test(g.nombre) ? "" : g.nombre, comp: nombreComp(g), tor: `rfevb:${g.id}`, fase: g.fase,
    pab: (p.pabellon || "").trim(),
  };
}

// Todos los partidos de un grupo con resultado: el calendario y, de las jornadas ya empezadas, el detalle.
export async function partidosGrupo(db: Db, g: Grupo): Promise<(PartidoEquipo & { pab: string })[]> {
  const cal = await calendario(db, g.id), byId = new Map<number, PartidoEquipo & { pab: string }>();
  for (const j of cal) for (const p of j.partidos || []) byId.set(p.id, aEquipo(p, g, j));
  const t = hoy(), js = cal.filter((j) => fechaIso(j.fecha) <= t);
  const det = await enTurnos(js, 4, (j) => jornada(db, j).catch(() => [] as PartidoApi[]));   // sin resultados de esa jornada: el calendario
  js.forEach((j, k) => { for (const p of det[k]) byId.set(p.id, aEquipo(p, g, j)); });
  return [...byId.values()].sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t));
}

// Calendario de un equipo (para teamMatches): id "rfevb:<escudo>".
export async function partidosEquipo(db: Db, idEquipo: string): Promise<PartidoEquipo[]> {
  const out: PartidoEquipo[] = [], suyos = new Set((await equipos(db)).filter((e) => e.id === idEquipo).map((e) => e.grupoId));
  for (const g of await grupos(db)) {
    if (!suyos.has(g.id)) continue;
    const ms = await partidosGrupo(db, g).catch(() => []);
    for (const m of ms) if (m.idl === idEquipo || m.idv === idEquipo) out.push(m);
  }
  return out;
}

// Equipos de todos los grupos (para buscar y seguir): nombre, competición y grupo (del calendario, caché 6 h).
export type EquipoRfevb = { id: string; team: string; cat: string; grupo: string; grupoId: number };
// Caché 6 h; el cron de indexar la tiene siempre caliente (en frío son ~15 s).
export function equipos(db: Db): Promise<EquipoRfevb[]> {
  return cached(db, "rfevb-equipos", 6 * H, async () => {
    const out = new Map<string, EquipoRfevb>();   // un equipo puede estar en más de un grupo (fases): uno por grupo
    const gs = await grupos(db), cals = await enTurnos(gs, 4, (g) => calendario(db, g.id).catch(() => [] as Jornada[]));
    gs.forEach((g, gi) => {
      for (const j of cals[gi]) for (const p of j.partidos || []) for (const [n, img] of [[p.equipo_local, p.img_local], [p.equipo_visitante, p.img_visitante]] as const) {
        const id = escudo(img), k = `${id}|${g.id}`;
        if (id && !out.has(k)) out.set(k, { id: `rfevb:${id}`, team: (n || "").trim(), cat: nombreComp(g), grupo: /UNIC/i.test(g.nombre) ? "" : g.nombre, grupoId: g.id });
      }
    });
    if (!out.size) throw new Error("RFEVB: sin equipos");
    return [...out.values()];
  });
}

export function clasificacion(db: Db, grupoId: number): Promise<FilaClasif[]> {
  return cached(db, `cla:rfevb:${grupoId}`, H, async () => {
    const rows = await api<Record<string, string>[]>(`getClasificacionGrupo?grupoId=${grupoId}`);
    const out = (rows || []).map((x) => ({
      pos: +x.posicion, id: `rfevb:${x.equipoId}`, n: (x.nombre || "").trim(), esc: String(x.imagen || "").replace(/^http:/, "https:"), racha: "",
      pt: +x.puntos, pj: +x.jugados, pg: +x.ganados, pp: +x.perdidos, sf: +x.sets_a_favor, sc: +x.sets_en_contra, pf: +x.puntos_a_favor, pc: +x.puntos_en_contra,
    }));
    if (!out.length) throw new Error("sin clasificación");
    return out;
  });
}

// Árbitros de un partido (arb1 = 1r, arb2 = 2n; arb3 y arb4, anotador y otro si vienen).
export async function oficiales(db: Db, id: string, jugado: boolean, force = false): Promise<Oficial[]> {
  const p = await partido(db, id.replace(/^rfevb:/, ""), jugado, force);
  return ([["r1", p.arb1], ["r2", p.arb2], ["an", p.arb3], ["otro", p.arb4]] as const)
    .filter(([, n]) => (n || "").trim()).map(([f, n]) => ({ f, n: (n || "").trim() }));
}

// --- Partidos arbitrados (resultados.ts): encontrar la designación de iSquad en la RFEVB por fecha y equipos. ---
// Los nombres no coinciden del todo (patrocinadores, "C.V.", catalán/castellano): se cuentan las palabras propias en común.
const VACIAS = new Set(["CV", "C", "V", "CLUB", "VOLEIBOL", "VOLEI", "VOLLEY", "VOLLEYBALL", "VB", "CE", "UE", "CD", "AD", "SD", "CB", "UD",
  "DE", "DEL", "LA", "EL", "LES", "ELS", "LOS", "LAS", "I", "Y", "SAD", "ASSOCIACIO", "ASOCIACION", "ESPORTIU", "DEPORTIVO", "DEPORTIVA",
  "ESPORTIVA", "FEMENINO", "MASCULINO", "FEMENI", "MASCULI", "SENIOR", "A", "B"]);
const palabras = (s: string) => new Set(norm(s).split(/[^A-Z0-9]+/).filter((w) => w.length > 1 && !VACIAS.has(w)));
export const comunes = (a: string, b: string) => { const x = palabras(a); let n = 0; for (const w of palabras(b)) if (x.has(w)) n++; return n; };

export type Encontrado = { id: string; sets: [number, number] | null; acta: string | null };
// null = no está en la RFEVB (otra temporada, otra competición); se busca solo en los grupos de su nivel y género.
export async function buscarDesignacion(db: Db, m: { date: string; time: string; teams: string; comp: string }): Promise<Encontrado | null> {
  const k = clasificaGrupo(m.comp.replace(/NACIONAL/i, "PRIMERA DIVISION")) || clasificaGrupo(`${m.comp} ${/FEMEN/i.test(m.comp) ? "FEMENINA" : "MASCULINA"}`);
  const [local, visit] = m.teams.split(/\s+vs\s+/i);
  let mejor: { p: PartidoApi; n: number } | null = null;
  for (const g of await grupos(db)) {
    if (k && (g.nivel !== k.nivel || g.genero !== k.genero)) continue;
    const cal = await calendario(db, g.id).catch(() => [] as Jornada[]);
    for (const j of cal) for (const p of j.partidos || []) {
      if (fechaIso(p.fecha || p.fecha_hora) !== m.date) continue;
      const n = comunes(local || "", p.equipo_local) + comunes(visit || "", p.equipo_visitante) + (horaDe(p) === m.time ? 1 : 0);
      if (!mejor || n > mejor.n) mejor = { p, n };
    }
  }
  // Al menos una palabra de un equipo y la hora, o una de cada equipo.
  if (!mejor || mejor.n < 2) return null;
  const p = await partido(db, mejor.p.id, false), s = sets(p);
  const acta = String(p.imagenActa || "").match(/href='([^']+)'/)?.[1] || null;
  return { id: String(p.id), sets: s ? [s[0], s[1]] : null, acta };
}
