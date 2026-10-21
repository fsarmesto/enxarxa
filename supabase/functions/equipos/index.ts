// Equipos que sigue el árbitro (como jugador, entrenador o por interés) a partir de la web pública de resultados de
// iSquad (resultadosvoleibol.isquad.es, la que enlaza la FCVB). Con la sesión del árbitro:
// - {action:"buscar", q}: equipos de la federación por nombre de equipo o de club.
// - {action:"seguir", club_id, team, cat} / {action:"dejar", ...}: favoritos. Al seguir se mira la plantilla del
//   equipo y, si sale el árbitro, se guarda si es jugador o entrenador (de la plantilla no se guarda nada más).
// - {action:"buscarme", club_id}: repasa las plantillas de todos los equipos de un club y sigue los que le incluyen.
// - {action:"mis"}: favoritos y sus próximos partidos.
// Las páginas públicas pesan ~1 MB cada una (el menú): todo pasa por la caché compartida pub_cache.
import { admin, cors, json, userFromRequest } from "../_shared/sync.ts";

const PUB = "https://resultadosvoleibol.isquad.es";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const TERRITORIAL = "17"; // Federació Catalana de Voleibol
const H = 3600_000;

const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const words = (s: string) => norm(s).split(/[^A-Z]+/).filter((w) => w.length > 1);
const text = (s: string) => decodeEntities((s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
function decodeEntities(s: string) {
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
const madridDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

async function getText(url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(25_000) });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`iSquad ${r.status}`); }
  return await r.text();
}

// deno-lint-ignore no-explicit-any
type Db = any;
async function cached<T>(db: Db, key: string, ttl: number, load: () => Promise<T>): Promise<T> {
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
type Partido = { d: string; c: boolean; l: string; v: string; cl: string; cv: string; comp: string; cat: string; pab: string; pista: string };
function feed(db: Db): Promise<Partido[]> {
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
function clubs(db: Db): Promise<{ id: string; name: string }[]> {
  return cached(db, "clubs", 7 * 24 * H, async () => {
    const s = await getText(`${PUB}/listado_clubs.php?seleccion=0&id_territorial=${TERRITORIAL}&id_superficie=1&iframe=0`);
    const out = new Map<string, string>();
    for (const m of s.matchAll(/href='club\.php\?id=(\d+)[^']*'>[\s\S]*?alt='([^']*)'/g)) if (!out.has(m[1])) out.set(m[1], decodeEntities(m[2]).trim());
    return [...out].map(([id, name]) => ({ id, name }));
  });
}

// Equipos de un club en la temporada en curso: id_equipo, nombre y categoría.
function clubTeams(db: Db, clubId: string): Promise<{ id: string; name: string; cat: string }[]> {
  return cached(db, `club:${clubId}`, 7 * 24 * H, async () => {
    const s = await getText(`${PUB}/club.php?id=${encodeURIComponent(clubId)}&id_superficie=1`);
    const out: { id: string; name: string; cat: string }[] = [];
    for (const m of s.matchAll(/<a href='equipo\.php\?id_equipo=(\d+)[^']*'>([\s\S]*?)<\/a>[\s\S]*?<\/td>\s*<td>([\s\S]*?)<\/td>/g)) {
      out.push({ id: m[1], name: text(fixMojibake(m[2])), cat: text(fixMojibake(m[3])) });
    }
    return out;
  });
}

// ¿Sale el árbitro en la plantilla del equipo? Devuelve 'jugador', 'entrenador', otro perfil o null. No se guarda la plantilla.
export async function roleIn(idEquipo: string, me: string[]): Promise<string | null> {
  if (!me.length) return null;
  const s = await getText(`${PUB}/equipo.php?id_equipo=${encodeURIComponent(idEquipo)}&id_territorial=${TERRITORIAL}`);
  const table = s.match(/<table class='table table-striped tabla-plantilla'>[\s\S]*?<\/table>/)?.[0] || "";
  for (const tr of table.match(/<tr>[\s\S]*?<\/tr>/g) || []) {
    const td = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => text(x[1]));
    if (td.length < 2) continue;
    const who = new Set(words(td[0]));
    if (me.every((w) => who.has(w))) {
      const p = norm(td[1]);
      return /ENTRENADOR|TECNIC/.test(p) ? "entrenador" : /JUGADOR/.test(p) ? "jugador" : td[1].toLowerCase() || "jugador";
    }
  }
  return null;
}

const sameTeam = (a: string, b: string) => norm(a) === norm(b);
function withGender(cat: string, comp: string) {
  const c = norm(comp), g = /\bFEM/.test(c) ? "FEMENINO" : /\bMASC/.test(c) ? "MASCULINO" : /\bMIXT/.test(c) ? "MIXTO" : "";
  return g && !norm(cat).includes(g) ? `${cat} ${g}` : cat;
}
// La categoría de la ficha del club no lleva género: "CUARTA DIVISION SENIOR" vale para "CUARTA DIVISION SENIOR FEMENINO".
const sameCat = (fav: string, full: string) => norm(full) === norm(fav) || norm(full).startsWith(norm(fav) + " ");

if (import.meta.main) Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  const db = admin();
  const user = await userFromRequest(db, req);
  if (!user) return json({ error: "Inicia sesión de nuevo" }, 401);
  let body: { action?: string; q?: string; club_id?: string; team?: string; cat?: string } = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }
  const { data: prof } = await db.from("profiles").select("nombre").eq("user_id", user.id).maybeSingle();
  const me = words(prof?.nombre || "");

  try {
    if (body.action === "buscar") {
      const q = norm(body.q || ""); if (q.length < 3) return json({ ok: true, equipos: [] });
      const [list, cl] = await Promise.all([feed(db), clubs(db)]);
      const clubName = new Map(cl.map((c) => [c.id, c.name]));
      const teams = new Map<string, { club_id: string; club: string; team: string; cat: string }>();
      for (const p of list) {
        for (const [name, cid] of [[p.l, p.cl], [p.v, p.cv]]) {
          const club = clubName.get(cid) || "";
          if (!norm(name).includes(q) && !norm(club).includes(q)) continue;
          const k = `${cid}|${norm(name)}|${norm(p.cat)}`;
          if (!teams.has(k)) teams.set(k, { club_id: cid, club, team: name, cat: p.cat });
        }
      }
      const out = [...teams.values()].sort((a, b) => a.club.localeCompare(b.club) || a.cat.localeCompare(b.cat) || a.team.localeCompare(b.team));
      // Clubs que coinciden (para "Búscame en este club").
      const cm = cl.filter((c) => norm(c.name).includes(q)).slice(0, 10);
      return json({ ok: true, equipos: out.slice(0, 60), clubs: cm });
    }

    if (body.action === "seguir" || body.action === "dejar") {
      const { club_id, team, cat } = body;
      if (!club_id || !team || !cat) return json({ error: "Faltan datos del equipo" }, 400);
      if (body.action === "dejar") {
        await db.from("fav_teams").delete().eq("user_id", user.id).eq("club_id", club_id).eq("team", team).eq("cat", cat);
        return json({ ok: true });
      }
      const [teamsOfClub, cl] = await Promise.all([clubTeams(db, club_id).catch(() => []), clubs(db).catch(() => [])]);
      const t = teamsOfClub.find((x) => sameTeam(x.name, team) && sameCat(x.cat, cat));
      const rol = t ? await roleIn(t.id, me).catch(() => null) : null;
      const row = { user_id: user.id, club_id, team, cat, club: cl.find((c) => c.id === club_id)?.name || null, id_equipo: t?.id || null, rol };
      const { error } = await db.from("fav_teams").upsert(row);
      return error ? json({ error: "No se ha podido guardar" }, 500) : json({ ok: true, fav: row });
    }

    if (body.action === "buscarme") {
      const club_id = body.club_id || "";
      const [teamsOfClub, cl] = await Promise.all([clubTeams(db, club_id), clubs(db)]);
      if (!me.length) return json({ error: "Aún no sé tu nombre: pulsa Actualizar ahora y vuelve a probar" }, 409);
      const found: Record<string, unknown>[] = [];
      let i = 0, checked = 0;
      // De 4 en 4 y con hora límite (las funciones tienen ~150 s).
      const worker = async () => {
        while (i < teamsOfClub.length && Date.now() - started < 110_000) {
          const t = teamsOfClub[i++];
          const rol = await roleIn(t.id, me).catch(() => null); checked++;
          if (rol) found.push({ user_id: user.id, club_id, team: t.name, cat: t.cat, club: cl.find((c) => c.id === club_id)?.name || null, id_equipo: t.id, rol });
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      if (found.length) await db.from("fav_teams").upsert(found);
      return json({ ok: true, found, checked, total: teamsOfClub.length });
    }

    if (body.action === "mis") {
      const { data: favs } = await db.from("fav_teams").select("club_id, team, cat, club, id_equipo, rol").eq("user_id", user.id);
      if (!favs?.length) return json({ ok: true, favs: [], partidos: [] });
      const list = await feed(db);
      const partidos = list.filter((p) => favs.some((f: { club_id: string; team: string; cat: string }) => sameCat(f.cat, p.cat) &&
        ((f.club_id === p.cl && sameTeam(f.team, p.l)) || (f.club_id === p.cv && sameTeam(f.team, p.v)))));
      return json({ ok: true, favs, partidos });
    }
  } catch (e) {
    return json({ error: "No se ha podido leer iSquad. Prueba en unos minutos.", detail: (e as Error).message }, 502);
  }
  return json({ error: "Acción no válida" }, 400);
});
