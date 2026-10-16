// Lectura de designaciones de iSquad (voleibol.misquad.es) con las credenciales del árbitro.
import { parseHTML } from "npm:linkedom@0.18.5";

const BASE = "https://voleibol.misquad.es";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

export class IsquadAuthError extends Error {}

export type ScrapedMatch = {
  id: string; comp: string; phase: string; teams: string; estado: string;
  date: string; time: string; venue: string; addr: string; venue_key: string;
  desig_id: string | null;
};
// Rol del árbitro y composición del equipo arbitral, sacados de "Ver Designación".
export type Staff = { role: "r1" | "r2" | "an" | "jl"; team: "t1" | "t2a" | "t2b" | "t3" };

type Jar = Map<string, string>;
function keep(jar: Jar, res: Response) {
  for (const c of res.headers.getSetCookie()) {
    const kv = c.split(";")[0]; const i = kv.indexOf("=");
    if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
  }
}
const cookie = (jar: Jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function get(url: string, jar: Jar): Promise<Response> {
  let res = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookie(jar) }, redirect: "manual" });
  for (let n = 0; n < 5 && res.status >= 300 && res.status < 400; n++) {
    keep(jar, res); await res.body?.cancel();
    const loc = res.headers.get("location"); if (!loc) break;
    const next = new URL(loc, url).toString();
    if (/login/i.test(next) && !/login/i.test(url)) return res; // nos manda al login: sesión no válida
    res = await fetch(next, { headers: { "User-Agent": UA, Cookie: cookie(jar) }, redirect: "manual" });
  }
  keep(jar, res);
  return res;
}

async function designaciones(jar: Jar, season?: string): Promise<string> {
  if (season) jar.set("TemporadaSelect", season); // la web de iSquad cambia de temporada con esta cookie
  const page = await get(`${BASE}/arbitros_designaciones.php?rol=1`, jar);
  if (page.status >= 300) { await page.body?.cancel(); throw new IsquadAuthError("login"); }
  return await page.text();
}

// Temporada que iSquad muestra por defecto y la anterior (la siguiente en su desplegable).
export function seasons(html: string): { current: string | null; previous: string | null } {
  // deno-lint-ignore no-explicit-any
  const { document } = parseHTML(html) as any;
  // deno-lint-ignore no-explicit-any
  const opts = [...document.querySelectorAll("#temporadaSelect option")].map((o: any) => ({ v: o.getAttribute("value"), sel: o.hasAttribute("selected") }));
  const i = opts.findIndex((o) => o.sel);
  return { current: i >= 0 ? opts[i].v : null, previous: i >= 0 ? opts[i + 1]?.v ?? null : null };
}

// Palabras del nombre en mayúsculas y sin acentos, para comparar "SANCHIS ARMESTO FERRAN" con "FERRAN SANCHIS ARMESTO".
const nameWords = (s: string) => norm(s).split(/[^A-Z]+/).filter((w) => w.length > 1);

// Nombre del árbitro que ha entrado (cabecera de la página).
export function ownName(html: string): string[] {
  // deno-lint-ignore no-explicit-any
  const { document } = parseHTML(html) as any;
  return nameWords(document.querySelector(".contact-container")?.textContent || "");
}

// Equipo arbitral de una designación. iSquad no numera a los árbitros: el primero de la lista es el 1r.
export function parseStaff(html: string, me: string[]): Staff | null {
  // deno-lint-ignore no-explicit-any
  const { document } = parseHTML(`<div>${html}</div>`) as any;
  // deno-lint-ignore no-explicit-any
  const table = [...document.querySelectorAll("table")].find((t: any) => /EQUIPO ARBITRAL/i.test(t.textContent || ""));
  if (!table || !me.length) return null;
  const people: { fn: string; mine: boolean }[] = [];
  for (const tr of table.querySelectorAll("tbody tr")) {
    const [a, b] = tr.querySelectorAll("td");
    if (!a || !b) continue;
    const who = new Set(nameWords(b.childNodes?.[0]?.textContent || b.textContent || ""));
    people.push({ fn: norm(a.textContent), mine: me.every((w) => who.has(w)) });
  }
  const refs = people.filter((p) => /^ARBITRO/.test(p.fn));
  const scorers = people.filter((p) => /ANOTADOR/.test(p.fn));
  const mine = people.find((p) => p.mine);
  if (!mine) return null;
  const team = refs.length >= 2 ? (scorers.length ? "t3" : "t2a") : (scorers.length ? "t2b" : "t1");
  const role = /ANOTADOR/.test(mine.fn) ? "an" : /LINEA/.test(mine.fn) ? "jl" : refs.indexOf(mine) === 1 ? "r2" : "r1";
  return { role, team };
}

async function fetchStaff(jar: Jar, desigId: string, me: string[]): Promise<Staff | null> {
  try {
    const r = await fetch(`${BASE}/json/arbitros_ver_datos_designacion.php`, {
      method: "POST", body: new URLSearchParams({ id_designacion: desigId }),
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA, Cookie: cookie(jar), "X-Requested-With": "XMLHttpRequest" },
    });
    if (!r.ok) { await r.body?.cancel(); return null; }
    const html = JSON.parse(await r.text())?.[0]?.html;
    return typeof html === "string" ? parseStaff(html, me) : null;
  } catch { return null; }
}

export type WithStaff = ScrapedMatch & { staff?: Staff | null };
// Máximo de designaciones que se abren en cada pasada; el resto, en la siguiente.
const STAFF_MAX_PER_RUN = 120;

export async function fetchDesignaciones(
  login: string, password: string,
  opts: { needStaff?: (m: ScrapedMatch) => boolean } = {},
): Promise<WithStaff[]> {
  const jar: Jar = new Map();
  const first = await get(`${BASE}/loginarbitros.php`, jar); await first.body?.cancel();

  const res = await fetch(`${BASE}/loginarbitros.php`, {
    method: "POST",
    body: new URLSearchParams({ login, password, qr_login: "0", utr: "" }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA, Cookie: cookie(jar),
      Origin: BASE, Referer: `${BASE}/loginarbitros.php`,
    },
    redirect: "manual",
  });
  keep(jar, res); await res.body?.cancel();

  // Sin la cookie TemporadaSelect iSquad marca la temporada en curso en el desplegable pero devuelve la tabla vacía:
  // la primera carga solo sirve para validar el login y saber qué temporadas hay.
  const html = await designaciones(jar);
  if (!parseDesignaciones(html)) throw new IsquadAuthError("login");
  const { current, previous } = seasons(html);
  const out: ScrapedMatch[] = [];
  // También la temporada anterior: al empezar una nueva, los partidos pendientes de cobro siguen allí.
  for (const season of [previous, current]) {
    if (season) out.push(...(parseDesignaciones(await designaciones(jar, season)) ?? []));
  }
  const all: WithStaff[] = uniqueIds(out);
  if (opts.needStaff) {
    const me = ownName(html);
    let n = 0;
    for (const m of all) {
      if (!m.desig_id || !opts.needStaff(m) || n++ >= STAFF_MAX_PER_RUN) continue;
      m.staff = await fetchStaff(jar, m.desig_id, me);
      // En Superliga el segundo "ARBITRO" de la lista es el juez de línea (en Superliga 2 sí hay 2n árbitro).
      if (m.staff?.role === "r2" && /SUPERLIGA/.test(norm(m.comp)) && !/SUPERLIGA ?2/.test(norm(m.comp))) m.staff.role = "jl";
    }
  }
  return all;
}

// En concentraciones y campeonatos iSquad repite el mismo código en varios partidos: a esos se les añade
// fecha y hora. Los demás conservan el código tal cual para que un cambio de horario no pierda lo marcado.
export function uniqueIds(list: ScrapedMatch[]): ScrapedMatch[] {
  const n = new Map<string, number>();
  for (const m of list) n.set(m.id, (n.get(m.id) || 0) + 1);
  const out = new Map<string, ScrapedMatch>();
  for (const m of list) {
    const id = n.get(m.id)! > 1 ? `${m.id}@${m.date}T${m.time}` : m.id;
    out.set(id, { ...m, id });
  }
  return [...out.values()];
}

const MONTHS: Record<string, number> = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

export function norm(s: string | null | undefined) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}
export function venueKey(name: string, addr: string) {
  const a = norm(addr); const parts = a.split(",").map((x) => x.trim()).filter(Boolean);
  if (/\d{5}/.test(a) && parts.length >= 3 && parts[0].length > 3) return parts[0] + (/^\d/.test(parts[1]) ? ", " + parts[1] : "");
  const k = norm(name).split(/\s+-\s*|\s*-\s+/)[0].replace(/\s+PISTA.*$/, "").replace(/\s+\d+$/, "").trim();
  return k || "SIN PABELLON";
}
export function venueLabel(name: string, addr: string) {
  const cap = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  const n = (name || "").split(/\s+-\s*|\s*-\s+/)[0].replace(/\s+\d+$/, "").trim();
  const city = norm(addr).match(/\d{5}\s+([^,]+)/);
  const nice = /^PISTA ?\d*$/i.test(n) ? "" : cap(n);
  return (nice ? nice + (city ? ` (${cap(city[1].trim())})` : "") : (city ? cap(city[1].trim()) : "")) || "Sin pabellón";
}

export function parseDesignaciones(html: string): ScrapedMatch[] | null {
  // deno-lint-ignore no-explicit-any
  const { document } = parseHTML(html) as any;
  const table = document.getElementById("tabla_designaciones_arbitrales");
  if (!table) return null;
  // deno-lint-ignore no-explicit-any
  // iSquad escapa las comillas con barra invertida (D\'HEBRON): se quitan para que la dirección se encuentre.
  const tx = (e: any) => (e?.textContent || "").replace(/\\(['"])/g, "$1").replace(/\s+/g, " ").trim();
  const out: ScrapedMatch[] = [];
  for (const tr of table.querySelectorAll("tr")) {
    // deno-lint-ignore no-explicit-any
    const c = [...tr.children].filter((e: any) => e.tagName === "TD");
    if (c.length < 10) continue;
    const fd = tx(c[8].querySelector(".text-bold")).match(/(\d{1,2})\s+(\S+)\s+(\d{4})/);
    const h = tx(c[8]).match(/(\d{1,2}):(\d{2})/);
    const mo = fd ? MONTHS[fd[2].toLowerCase()] : 0;
    if (!fd || !h || !mo) continue;
    const venue = tx(c[9].querySelector(".text-bold")), addr = tx(c[9].querySelector("span"));
    out.push({
      id: tx(c[0]), comp: tx(c[2].querySelector(".text-bold")), phase: tx(c[2].querySelector("span")),
      teams: [...c[3].querySelectorAll(".text-bold")].map(tx).join(" vs "), estado: tx(c[7]).toUpperCase(),
      date: `${fd[3]}-${String(mo).padStart(2, "0")}-${fd[1].padStart(2, "0")}`,
      time: `${h[1].padStart(2, "0")}:${h[2]}`, venue, addr, venue_key: venueKey(venue, addr),
      desig_id: (c[4].innerHTML || "").match(/ver_designacion\((\d+)\)/)?.[1] ?? null,
    });
  }
  return out;
}
