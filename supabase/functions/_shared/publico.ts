// Web pública de resultados de iSquad (resultadosvoleibol.isquad.es): lectura y caché compartida.

export const PUB = "https://resultadosvoleibol.isquad.es";
export const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
export const TERRITORIAL = "17"; // Federació Catalana de Voleibol
export const H = 3600_000;

export const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
export const words = (s: string) => norm(s).split(/[^A-Z]+/).filter((w) => w.length > 1);
export const text = (s: string) => decodeEntities((s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
export function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}
// Algunos textos de iSquad vienen con el UTF-8 leído como Windows-1252 ("PAVELLÃ“" = "PAVELLÓ"): se recompone.
const CP1252: Record<string, number> = { "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89,
  "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98,
  "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f };
export function fixMojibake(s: string) {
  if (!/[ÃÂ]/.test(s)) return s;
  const bytes: number[] = [];
  for (const c of s) {
    const code = c.charCodeAt(0);
    if (code < 256) bytes.push(code); else if (c in CP1252) bytes.push(CP1252[c]); else return s;
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes)); } catch { return s; }
}
export const madridDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

export async function getText(url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(25_000) });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`iSquad ${r.status}`); }
  return await r.text();
}

// deno-lint-ignore no-explicit-any
export type Db = any;
export async function cached<T>(db: Db, key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const { data } = await db.from("pub_cache").select("data, fetched_at").eq("key", key).maybeSingle();
  if (data && Date.now() - new Date(data.fetched_at).getTime() < ttl) return data.data as T;
  try {
    const fresh = await load();
    await db.from("pub_cache").upsert({ key, data: fresh, fetched_at: new Date().toISOString() });
    return fresh;
  } catch (e) {
    if (data) return data.data as T; // si iSquad falla, mejor lo de antes que nada
    throw e;
  }
}

// Todos los partidos de la federación desde hoy (lo que muestra "Partidos Globales"): ~7.000 filas, 13 MB en bruto.
export type Partido = { d: string; c: boolean; l: string; v: string; cl: string; cv: string; comp: string; cat: string; pab: string; pista: string };
export function feed(db: Db): Promise<Partido[]> {
  return cached(db, "feed", 3 * H, async () => {
    const raw = await getText(`${PUB}/json/partidos_equipos_consultas.php`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
      body: new URLSearchParams({ accion: "obtener_partidos", id_ambito: TERRITORIAL, fecha_actual: madridDate(), consulta: "0", id_superficie: "1" }),
    });
    // deno-lint-ignore no-explicit-any
    const rows: any[] = JSON.parse(raw)?.data || [];
    return rows.filter((x) => x.fecha).map((x) => {
      const campo = String(x.campo || "").split(/<\/?br\s*\/?>/i).map((p) => text(fixMojibake(p)));
      return {
        d: String(x.fecha).slice(0, 16), c: String(x.fecha_confirmada) === "1",
        l: text(fixMojibake(x.nombre_local)), v: text(fixMojibake(x.nombre_visitante)),
        cl: String(x.id_club_local || ""), cv: String(x.id_club_visitante || ""),
        // La categoría de iSquad no lleva el género ("CUARTA DIVISION SENIOR"): se añade de la competición ("... SEN FEM").
        comp: text(fixMojibake(x.nombre_competicion)), cat: withGender(text(fixMojibake(x.categoria)), text(x.nombre_competicion)),
        pab: text(fixMojibake(x.nombre_instalacion)) || campo[0] || "", pista: campo[1] || "",
      };
    });
  });
}

// Clubs de la federación (id y nombre).
export function clubs(db: Db): Promise<{ id: string; name: string }[]> {
  return cached(db, "clubs", 7 * 24 * H, async () => {
    const s = await getText(`${PUB}/listado_clubs.php?seleccion=0&id_territorial=${TERRITORIAL}&id_superficie=1&iframe=0`);
    const out = new Map<string, string>();
    for (const m of s.matchAll(/href='club\.php\?id=(\d+)[^']*'>[\s\S]*?alt='([^']*)'/g)) if (!out.has(m[1])) out.set(m[1], decodeEntities(m[2]).trim());
    return [...out].map(([id, name]) => ({ id, name }));
  });
}

// Equipos de un club en la temporada en curso: id_equipo, nombre y categoría.
export function clubTeams(db: Db, clubId: string): Promise<{ id: string; name: string; cat: string }[]> {
  return cached(db, `club:${clubId}`, 7 * 24 * H, async () => {
    const s = await getText(`${PUB}/club.php?id=${encodeURIComponent(clubId)}&id_superficie=1`);
    const out: { id: string; name: string; cat: string }[] = [];
    for (const m of s.matchAll(/<a href='equipo\.php\?id_equipo=(\d+)[^']*?id_temp=(\d+)[^']*'>([\s\S]*?)<\/a>[\s\S]*?<\/td>\s*<td>([\s\S]*?)<\/td>/g)) {
      if (m[2] !== seasonCode()) continue; // la ficha del club lista también temporadas pasadas
      out.push({ id: m[1], name: text(fixMojibake(m[3])), cat: text(fixMojibake(m[4])) });
    }
    return out;
  });
}

// Temporada de iSquad en curso ("2627" de agosto de 2026 a julio de 2027).
export function seasonCode(d = new Date()) {
  const y = d.getFullYear() % 100, start = d.getMonth() >= 7 ? y : y - 1;
  return `${String(start).padStart(2, "0")}${String(start + 1).padStart(2, "0")}`;
}
// Perfil de iSquad ("Jugador", "Entrenador", "2º Entrenador", "Invitado"...) en el que usa la app.
export const perfilOf = (p: string) => { const n = norm(p); return /ENTRENADOR|TECNIC/.test(n) ? "entrenador" : /JUGADOR/.test(n) ? "jugador" : (p || "").toLowerCase() || "jugador"; };
// Plantilla pública de un equipo: nombre, foto de afiliado (images/afiliacion/...) y perfil de cada persona.
export async function roster(idEquipo: string): Promise<{ name: string; foto: string; perfil: string }[]> {
  const s = await getText(`${PUB}/equipo.php?id_equipo=${encodeURIComponent(idEquipo)}&id_territorial=${TERRITORIAL}`);
  const table = s.match(/<table class='table table-striped tabla-plantilla'>[\s\S]*?<\/table>/)?.[0] || "";
  const out: { name: string; foto: string; perfil: string }[] = [];
  for (const tr of table.match(/<tr>[\s\S]*?<\/tr>/g) || []) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1]);
    if (cells.length < 2) continue;
    const foto = cells[0].match(/images\/afiliacion\/([^"'\s>]+)/)?.[1] || "";
    out.push({ name: text(fixMojibake(cells[0])), foto, perfil: text(cells[1]) });
  }
  return out;
}
// ¿Sale el árbitro en la plantilla? Por foto de afiliado (inequívoca) o, si no, por nombre (todas sus palabras).
export async function roleIn(idEquipo: string, me: string[], foto = ""): Promise<string | null> {
  if (!me.length && !foto) return null;
  for (const p of await roster(idEquipo)) {
    const who = new Set(words(p.name));
    if ((foto && p.foto === foto) || (me.length && me.every((w) => who.has(w)))) return perfilOf(p.perfil);
  }
  return null;
}
// Huella de una persona para el índice de plantillas: HMAC-SHA256 con el secret ROSTER_SALT. Foto ("f:") y nombre
// ("n:", palabras ordenadas, así da igual "APELLIDOS NOMBRE" o "NOMBRE APELLIDOS").
export async function huella(kind: "f" | "n", value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("ROSTER_SALT") || ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${kind}:${value}`));
  return [...new Uint8Array(sig)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const nameKey = (s: string) => [...new Set(words(s))].sort().join(" ");

export const sameTeam = (a: string, b: string) => norm(a) === norm(b);
export function withGender(cat: string, comp: string) {
  const c = norm(comp), g = /\bFEM/.test(c) ? "FEMENINO" : /\bMASC/.test(c) ? "MASCULINO" : /\bMIXT/.test(c) ? "MIXTO" : "";
  return g && !norm(cat).includes(g) ? `${cat} ${g}` : cat;
}
// La categoría de la ficha del club no lleva género: "CUARTA DIVISION SENIOR" vale para "CUARTA DIVISION SENIOR FEMENINO".
export const sameCat = (fav: string, full: string) => norm(full) === norm(fav) || norm(full).startsWith(norm(fav) + " ");


// API del buscador público (la que usa el buscador de resultadosvoleibol): necesita el token que va en cada página
// ("let token = ..."). Se guarda 12 h y se renueva si la API lo rechaza. La página puede llegar con error 500 y
// entera (pasaba el 26-oct-2026): vale igual si trae el token.
const API = "https://voleibol.isquad.es/json/api/call.php/resultados/busquedaGlobal";
async function apiToken(db: Db, renew = false): Promise<string> {
  if (renew) await db.from("pub_cache").delete().eq("key", "token");
  return await cached(db, "token", 12 * H, async () => {
    const r = await fetch(`${PUB}/competicion.php?id_superficie=1&seleccion=0&id_territorial=${TERRITORIAL}`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(25_000) });
    const s = await r.text();
    const t = s.match(/let token = "([0-9a-f]+)"/)?.[1];
    if (!t) throw new Error(`sin token (iSquad ${r.status})`);
    return t;
  });
}
async function apiSearch(db: Db, params: Record<string, string>) {
  for (const renew of [false, true]) {
    const token = await apiToken(db, renew);
    const r = await fetch(`${API}?token=${token}`, {
      method: "POST", body: new URLSearchParams(params), signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": UA, Origin: PUB, Referer: `${PUB}/` },
    });
    if (r.ok) return await r.json();
    await r.body?.cancel();
  }
  throw new Error("API de iSquad no disponible");
}

// Calendario de la temporada de un equipo con estado y resultado (sets). Estados de iSquad: Pendiente, Finalizado,
// Suspendido, Aplazado... "conf" = horario confirmado (si no, la hora es provisional o falta).
export type PartidoEquipo = { id: string; d: string; t: string; conf: boolean; est: string; l: string; v: string; idl: string; idv: string;
  rl: number | null; rv: number | null; j: string; g: string; comp: string; tor: string; fase: string };
export function teamMatches(db: Db, idEquipo: string, name: string): Promise<PartidoEquipo[]> {
  return cached(db, `tm2:${idEquipo}`, 0.5 * H, async () => {
    const out: PartidoEquipo[] = [];
    for (let page = 1; page <= 6; page++) {
      const res = await apiSearch(db, { q: name, id_temporada: seasonCode(), id_superficie: "1", seleccion: "0", limit: "20", categoria: "partidos", page: String(page) });
      // deno-lint-ignore no-explicit-any
      for (const p of (res?.data?.partidos || []) as any[]) {
        if (String(p.id_local) !== idEquipo && String(p.id_visitante) !== idEquipo) continue;
        const [dd, mm, yy] = String(p.fecha || "").split("/");
        const hora = String(p.hora || "").padStart(5, "0");
        out.push({
          id: String(p.id_partido), d: yy ? `${yy}-${mm}-${dd}` : "", t: hora === "00:00" || hora === "0:00" ? "" : hora,
          conf: String(p.fecha_confirmada) === "1", est: String(p.estado || ""), l: fixMojibake(String(p.nombre_local || "")).trim(),
          v: fixMojibake(String(p.nombre_visitante || "")).trim(), idl: String(p.id_local), idv: String(p.id_visitante),
          rl: p.resultado_local == null ? null : +p.resultado_local, rv: p.resultado_visitante == null ? null : +p.resultado_visitante,
          j: String(p.jornada || ""), g: String(p.grupo || ""), comp: fixMojibake(String(p.nombre_competicion || "")),
          tor: String(p.id_torneo || ""), fase: fixMojibake(String(p.nombre_fase || "")),
        });
      }
      if (!res?.has_more?.partidos) break;
    }
    return out.sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t));
  });
}

// Clasificación de un grupo (torneo) según la web pública (clasificacion.php, ~900 KB): una fila por equipo con
// posición, puntos, partidos, sets, puntos de juego y racha de los 5 últimos (G/P/-). Caché 1 h.
export type FilaClasif = { pos: number; id: string; n: string; esc: string; pt: number; pj: number; pg: number; pp: number;
  sf: number; sc: number; pf: number; pc: number; racha: string };
export function standings(db: Db, torneo: string): Promise<FilaClasif[]> {
  return cached(db, `cla:${torneo}`, H, async () => {
    const s = await getText(`${PUB}/clasificacion.php?seleccion=0&id=${encodeURIComponent(torneo)}&id_ambito=0&id_territorial=${TERRITORIAL}&id_superficie=1&iframe=0`);
    const i = s.indexOf("table-striped clasificacion"), tb = i < 0 ? "" : s.slice(s.indexOf("<tbody", i), s.indexOf("</table>", i));
    const out: FilaClasif[] = [];
    for (const tr of tb.split(/<tr[\s>]/).slice(1)) {
      const td = [...tr.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
      if (td.length < 13) continue;
      const num = (k: number) => { const m = td[k][1].match(/data-export="(-?\d+)"/) || text(td[k][2]).match(/-?\d+/); return m ? +(m[1] ?? m[0]) : 0; };
      out.push({
        pos: num(0), id: tr.match(/id_equipo=(\d+)/)?.[1] || "", n: text(fixMojibake(td[1][1].match(/data-export="([^"]*)"/)?.[1] || td[1][2])),
        esc: tr.match(/src='(http[^']*afiliacion_clubs[^']*)'/)?.[1]?.replace(/^http:/, "https:") || "",
        racha: [...td[2][2].matchAll(/class='(\w+) racha'/g)].map((m) => m[1] === "ganado" ? "G" : m[1] === "perdido" ? "P" : "-").join(""),
        pt: num(3), pj: num(4), pg: num(5), pp: num(6), sf: num(7), sc: num(8), pf: num(9), pc: num(10),
      });
    }
    if (!out.length) throw new Error("sin clasificación");
    return out;
  });
}

// Equipo arbitral de un partido según su "Previo" público (previo.php, ~800 KB): un bloque por persona (div1, div2...)
// con su función ("ARBITRO", "ARBITRO", "ANOTADOR/CRONOMETRADOR"...); el primer ARBITRO es el 1r. Sale en cuanto la
// FCVB lo designa. Caché: 3 h si aún no se ha jugado (lo pueden designar o cambiar), 30 días si ya se jugó.
export type Oficial = { f: string; n: string };
export function matchOfficials(db: Db, idPartido: string, jugado: boolean): Promise<Oficial[]> {
  return cached(db, `arb:${idPartido}`, (jugado ? 30 * 24 : 3) * H, async () => {
    const s = await getText(`${PUB}/previo.php?id_partido=${encodeURIComponent(idPartido)}`);
    const out: Oficial[] = [];
    let refs = 0;
    for (const m of s.matchAll(/<div class="div\d+">\s*<div>\s*([^<]*?)\s*<\/div>\s*<div>\s*([^<]*?)\s*<\/div>\s*<\/div>/g)) {
      const fn = norm(m[1]), n = text(fixMojibake(m[2]));
      if (!n || /^TV$/.test(fn)) continue;
      const f = /ANOTADOR/.test(fn) ? "an" : /LINEA/.test(fn) ? "jl" : /ARBITRO/.test(fn) ? (refs++ === 0 ? "r1" : "r2") : fn.toLowerCase();
      out.push({ f, n });
    }
    return out;
  });
}

// Páginas de árbitros de la web pública: llegan en windows-1252 y solo responden bien como petición AJAX.
// valeCon: una respuesta con error que se acepta igual si su texto lo cumple (iSquad da 500 con páginas válidas).
export async function getLatin(url: string, valeCon?: RegExp) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest" }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok && !valeCon) { await r.body?.cancel(); throw new Error(`iSquad ${r.status}`); }
  const s = new TextDecoder("windows-1252").decode(await r.arrayBuffer());
  if (!r.ok && !valeCon!.test(s)) throw new Error(`iSquad ${r.status}`);
  return s;
}

// Árbitros de la FCVB en la web pública (listado_arbitros.php, 1,6 MB): id de su ficha, nombre y foto de afiliado. 7 días.
export type ArbitroPub = { id: string; name: string; foto: string };
export function arbitrosPublicos(db: Db): Promise<ArbitroPub[]> {
  return cached(db, "arbitros", 7 * 24 * H, async () => {
    const s = await getLatin(`${PUB}/listado_arbitros.php?id_territorial=${TERRITORIAL}&id_superficie=1&seleccion=0`);
    return s.split("arb-federacion-card").slice(1).map((c) => ({
      id: c.match(/partidosArbitro\((\d+)\)/)?.[1] || "",
      name: fixMojibake(c.match(/arb-federacion-data">\s*<div>\s*<div>\s*([^<]+?)\s*<\/div>/)?.[1] || ""),
      foto: c.match(/imagen_([^"'./]+)\./)?.[1] || "",
    })).filter((a) => a.id);
  });
}

// Ficha pública de un usuario: por su foto de afiliado (la misma que en su área de iSquad) o, si no, por el nombre
// (las mismas palabras, en cualquier orden; solo si hay un único candidato). Comprobado 21-oct: 16 de 16 árbitros.
export async function idArbitro(db: Db, nombre: string | null, foto: string | null): Promise<string | null> {
  const list = await arbitrosPublicos(db);
  const f = (foto || "").match(/imagen_([^./]+)\./)?.[1];
  const byFoto = f && list.find((a) => a.foto === f);
  if (byFoto) return byFoto.id;
  const mine = words(nombre || "");
  const cands = list.filter((a) => { const w = words(a.name); return w.length >= 2 && w.every((x) => mine.includes(x)); });
  return cands.length === 1 ? cands[0].id : null;
}

// Huella de la ficha pública "próximos partidos que arbitrará" (~2 KB, sin login): partido, fecha, hora, pabellón y
// equipo arbitral. Si no cambia, en el área privada no hay nada nuevo que leer.
export async function huellaFicha(id: string): Promise<string> {
  // Sin designaciones próximas, iSquad responde "SIN PARTIDOS" con error 500 (visto el 27-oct-2026): es una ficha vacía.
  const s = await getLatin(`${PUB}/partidos_arbitro.php?id_arbitro=${id}&id_superficie=1`, /SIN PARTIDOS/);
  const rows = (s.match(/<tr[\s\S]*?<\/tr>/g) || []).map((tr) => text(tr)).join("\n");
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rows));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
