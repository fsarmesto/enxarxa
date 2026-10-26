// Estado del resultado y del acta de los partidos arbitrados (issue #31), de la web pública de resultados, sin login.
// - Resultado: el que está metido en iSquad. voleibol_acta_completa.php?id_partido= (PDF ~106 KB, ~3 s) se genera siempre
//   y sale "relleno" con los sets cuando hay resultado (comprobado en 81 partidos: igual que el marcador de la API
//   pública). De la temporada en curso se mira antes el calendario público del equipo (teamMatches, caché compartida con
//   Equipos), que es más barato; si no sale, el PDF. De temporadas pasadas la búsqueda no sirve (los partidos salen a
//   partir de la página 9-15, o no salen): directamente el PDF.
// - Acta subida: json/competicion/acta_escaneada.php?id_partido= devuelve la URL del PDF escaneado o null (80 bytes).
//   Es la foto del acta de papel: puede estar sin resultado y al revés.
// - Competiciones estatales (Superliga, Nacional): su resultado no sale en la web de la FCVB ni en el acta completa; en la
//   web, resultado "Otro". El acta sí se mira.
// Los ids salen de la tabla de designaciones (parseDesignaciones). Una vez encontrado, no se vuelve a pedir.
import { PUB, seasonCode, teamMatches, UA, type Db } from "./publico.ts";

// Todos los partidos arbitrados tienen que acabar con los 2 estados: se miran los empezados hace más de 1 h, los de los
// últimos DAYS días en cada pasada y los anteriores que aún falten, como mucho una vez cada OLD_EVERY (los que ya no se
// publicarán no deben gastar peticiones cada día). Como mucho MAX por pasada, primero los más nuevos.
const DAYS = 30, OLD_EVERY = 7 * 864e5, MAX = 20, AFTER_MIN = 60;
// Mismo criterio que pubState en la web.
export const ESTATAL = /SUPERLIGA|NACIONAL/i;
// Hora de Madrid como texto "AAAA-MM-DD HH:MM" (las designaciones van en hora de Madrid).
const madridNow = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date());
const plusMin = (d: string, t: string, min: number) => new Date(Date.parse(`${d}T${t}:00Z`) + min * 6e4).toISOString().slice(0, 16).replace("T", " ");

export async function actaEscaneada(idPartido: string): Promise<string | null> {
  const r = await fetch(`${PUB}/json/competicion/acta_escaneada.php?id_partido=${encodeURIComponent(idPartido)}`,
    { headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest" }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`acta ${r.status}`); }
  const url = (await r.json())?.result;
  return typeof url === "string" && url ? url : null;
}
// Hora de subida: en la mayoría de actas el nombre del fichero es la hora en segundos Unix (uploads/actas/<id>/<s>.pdf).
const subidaDe = (url: string) => { const s = url.match(/\/(\d{10})\.pdf$/)?.[1]; return s ? new Date(+s * 1000).toISOString() : null; };

// Sets del acta completa: el texto va tal cual en un stream deflate de la página, "RESULTADOS \(L/V\): 23/25; 18/25; ... /;".
// Devuelve los sets ganados [local, visitante], o null si el acta sale vacía (resultado sin meter).
async function inflate(bytes: Uint8Array): Promise<string> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate")));
  return new TextDecoder("latin1").decode(await out.arrayBuffer());
}
export function setsDe(text: string): [number, number] | null {
  const line = text.match(/RESULTADOS \\\(L\/V\\\):([^)]*)\)/)?.[1];
  if (line == null) throw new Error("acta sin línea de resultados");
  let l = 0, v = 0;
  for (const [, a, b] of line.matchAll(/(\d+)\/(\d+)/g)) +a > +b ? l++ : v++;
  return l + v ? [l, v] : null;
}
export async function actaCompleta(idPartido: string): Promise<[number, number] | null> {
  const r = await fetch(`https://voleibol.isquad.es/voleibol_acta_completa.php?id_partido=${encodeURIComponent(idPartido)}`,
    { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`acta completa ${r.status}`); }
  const pdf = new Uint8Array(await r.arrayBuffer()), raw = new TextDecoder("latin1").decode(pdf);
  for (const m of raw.matchAll(/stream\r?\n/g)) {
    const start = m.index! + m[0].length;
    let end = raw.indexOf("endstream", start);
    if (end < 0) break;
    // DecompressionStream no acepta ni un byte de más: el largo exacto de /Length o, si no está, sin los saltos del final.
    const len = raw.slice(Math.max(0, m.index! - 300), m.index).match(/\/Length (\d+)(?! \d+ R)[^/]*>>\s*$/)?.[1];
    if (len) end = start + +len;
    else while (end > start && (pdf[end - 1] === 10 || pdf[end - 1] === 13)) end--;
    let text = "";
    try { text = await inflate(pdf.subarray(start, end)); } catch { continue; }
    if (text.includes("RESULTADOS \\(L/V\\)")) return setsDe(text);
  }
  throw new Error("acta completa sin resultados");
}

type Row = { id: string; date: string; time: string; teams: string; comp: string; estado: string | null; id_partido: string;
  eq_l: string | null; eq_v: string | null; res_l: number | null; acta_url: string | null; pub_checked: string | null };

export async function checkResultados(db: Db, userId: string, deadline: number): Promise<string> {
  const now = madridNow(), recent = new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10), season = seasonCode();
  const { data } = await db.from("matches").select("id, date, time, teams, comp, estado, id_partido, eq_l, eq_v, res_l, acta_url, pub_checked")
    .eq("user_id", userId).not("id_partido", "is", null).lte("date", now.slice(0, 10))
    .or("res_l.is.null,acta_url.is.null").order("date", { ascending: false }).limit(500);
  // Selecciones, suspendidos y aplazados: no publican resultado ni acta (en la web, estado "Otro"); no se miran.
  const needRes = (m: Row) => m.res_l == null && !ESTATAL.test(m.comp);
  const todo = ((data || []) as Row[]).filter((m) => !/SELECCI/i.test(m.comp) && !/SUSPEND|APLAZ|ANULA/.test(m.estado || "")
    && (needRes(m) || !m.acta_url) && now >= plusMin(m.date, m.time || "00:00", AFTER_MIN)
    && (m.date >= recent || !m.pub_checked || Date.now() - Date.parse(m.pub_checked) > OLD_EVERY)).slice(0, MAX);
  let res = 0, actas = 0, errores = 0, fallo = "", n = 0;
  for (const m of todo) {
    if (Date.now() > deadline - 15_000) break;
    n++;
    const patch: Record<string, unknown> = { pub_checked: new Date().toISOString() };
    try {
      if (needRes(m)) {
        let sets: [number, number] | null | undefined;   // undefined = no encontrado en la API
        if (seasonCode(new Date(`${m.date}T12:00:00Z`)) === season) {
          const names = m.teams.split(" vs ");
          for (const [eq, name] of [[m.eq_l, names[0]], [m.eq_v, names[1]]]) {
            if (!eq || !name) continue;
            const p = (await teamMatches(db, eq, name)).find((x) => x.id === m.id_partido);
            if (p) { sets = p.rl != null && p.rv != null ? [p.rl, p.rv] : null; break; }
          }
        }
        if (sets === undefined) sets = await actaCompleta(m.id_partido);
        if (sets) { patch.res_l = sets[0]; patch.res_v = sets[1]; patch.res_at = patch.pub_checked; res++; }
      }
    } catch (e) { errores++; fallo ||= (e as Error).message; }
    try {
      if (!m.acta_url) {
        const url = await actaEscaneada(m.id_partido);
        if (url) { patch.acta_url = url; patch.acta_at = subidaDe(url) ?? patch.pub_checked; actas++; }
      }
    } catch (e) { errores++; fallo ||= (e as Error).message; }
    await db.from("matches").update(patch).eq("user_id", userId).eq("id", m.id);
  }
  return `${n} de ${todo.length} mirados: ${res} resultados, ${actas} actas${errores ? `, ${errores} errores (${fallo})` : ""}`;
}
