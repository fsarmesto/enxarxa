import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { decrypt } from "./crypto.ts";
import { fetchDesignaciones, IsquadAuthError, ScrapedMatch, venueLabel, WithStaff } from "./isquad.ts";

export const admin = (): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export async function userFromRequest(db: SupabaseClient, req: Request) {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await db.auth.getUser(jwt);
  return data?.user ?? null;
}

/* Km de ida por carretera. Las direcciones y poblaciones se buscan en Photon (photon.komoot.io, datos de
   OpenStreetMap, sin clave ni cupo diario; Nominatim no se puede usar porque bloquea las IP de Supabase) y la ruta
   se calcula con OpenRouteService (secret ORS_KEY, 200 rutas al día). Las dos cosas se guardan en caché
   compartida entre árbitros. La FCVB paga la ruta más corta, pero no la "más corta" pura (caminos de 90 minutos para
   ahorrar 2 km): se pide la ruta con alternativas y se toma la de menos km. */
type Place = { at: [number, number]; exact: boolean };
// deno-lint-ignore no-explicit-any
type GeoHit = any;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const UA = "liquidacion-arbitral-fcvb/1.0 (https://github.com/fsarmesto/liquidacion-arbitral-fcvb)";
const CAT_BBOX = "&bbox=0.15,40.5,3.35,42.9"; // solo Catalunya
const GEO_GAP_MS = 1000, ORS_GAP_MS = 1600;   // uso moderado de Photon; 40/min en ORS
// Lo no encontrado se vuelve a buscar a la semana, igual que el reintento de cada pabellón.
const RETRY_AFTER_MS = 7 * 864e5, NOT_FOUND_TTL_MS = RETRY_AFTER_MS;
const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

// Cada llamada reserva su turno antes de esperar: así dos peticiones a la vez no salen juntas.
function pacer(gap: number) {
  let next = 0;
  return async () => { const now = Date.now(), at = Math.max(now, next); next = at + gap; if (at > now) await sleep(at - now); };
}
const paceGeo = pacer(GEO_GAP_MS), paceOrs = pacer(ORS_GAP_MS);
let lastServiceError = "";   // para el resumen de la pasada

// "error" = fallo de red o del servicio: no se guarda en caché ni cuenta como intento. null = no encontrado.
type Fail = "error" | "quota";
// Poblaciones: solo la capa "city" de Photon (municipios, también los pueblos), nunca barrios ni calles.
async function photon(text: string, town: boolean): Promise<GeoHit | null | "error"> {
  await paceGeo();
  try {
    const r = await fetch(`https://photon.komoot.io/api/?limit=1${CAT_BBOX}` + (town ? "&layer=city" : "") + `&q=${encodeURIComponent(text)}`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) { lastServiceError = `Photon ${r.status}: ${(await r.text()).slice(0, 120)}`; console.warn(`km: ${lastServiceError}`); return "error"; }
    return (await r.json())?.features?.[0] ?? null;
  } catch (e) { lastServiceError = `Photon: ${(e as Error).message}`; console.warn(`km: ${lastServiceError}`); return "error"; }
}

async function geocode(db: SupabaseClient, text: string, town: boolean, accept?: (h: GeoHit) => boolean): Promise<Place | null | "error"> {
  const query = (town ? "town:" : "addr:") + norm(text);
  const { data: c } = await db.from("geo_cache").select("lon, lat, exact, found, created_at").eq("query", query).maybeSingle();
  if (c && (c.found || Date.now() - new Date(c.created_at).getTime() < NOT_FOUND_TTL_MS)) {
    return c.found ? { at: [c.lon, c.lat], exact: c.exact } : null;
  }
  let hit = await photon(text, town);
  if (hit === "error") return "error";
  if (hit && accept && !accept(hit)) hit = null;
  // Portal, edificio o calle es dirección exacta; lo demás (barrio, población), aproximado.
  const place: Place | null = hit
    ? { at: [+hit.geometry.coordinates[0], +hit.geometry.coordinates[1]], exact: !town && ["house", "street"].includes(hit.properties?.type) }
    : null;
  await db.from("geo_cache").upsert({ query, lon: place?.at[0] ?? null, lat: place?.at[1] ?? null, exact: place?.exact ?? false,
    found: !!place, created_at: new Date().toISOString() });
  return place;
}

// "quota" = ORS rechaza por cupo o ritmo (403/429): hay que parar la pasada.
// Prefijo "c:" = ruta más corta entre alternativas; las claves sin prefijo son de la ruta más rápida (antes del cambio).
const routeKey = (a: [number, number], b: [number, number]) =>
  `c:${a.map((x) => x.toFixed(4)).join(",")}>${b.map((x) => x.toFixed(4)).join(",")}`;
async function cachedKm(db: SupabaseClient, a: [number, number], b: [number, number]): Promise<number | null> {
  const { data: c } = await db.from("route_cache").select("km").eq("key", routeKey(a, b)).maybeSingle();
  return c ? +c.km : null;
}
const saveKm = (db: SupabaseClient, a: [number, number], b: [number, number], km: number) =>
  db.from("route_cache").upsert({ key: routeKey(a, b), km });

// Vía principal: una ruta con hasta 3 alternativas (cupo de 200 al día) y se queda la de menos km. ORS solo da
// alternativas hasta unos 100 km (error 2004): más lejos, la ruta normal. "quota" = sin cupo o ritmo (403/429): hay que parar.
const ALTERNATIVES = { target_count: 3, weight_factor: 1.6, share_factor: 0.6 };
async function driveKm(db: SupabaseClient, a: [number, number], b: [number, number], key: string): Promise<number | null | Fail> {
  const c = await cachedKm(db, a, b);
  if (c != null) return c;
  try {
    for (const alt of [true, false]) {
      await paceOrs();
      const r = await fetch("https://api.openrouteservice.org/v2/directions/driving-car", {
        method: "POST", signal: AbortSignal.timeout(10_000),
        headers: { "Authorization": key, "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: [a, b], ...(alt ? { alternative_routes: ALTERNATIVES } : {}) }),
      });
      if (r.status === 403 || r.status === 429) { console.warn(`km: ORS sin cupo (${r.status})`); await r.body?.cancel(); return "quota"; }
      if (r.status === 404) { await r.body?.cancel(); return null; }   // sin ruta posible entre los dos puntos
      if (r.status === 400 && alt) {
        const err = await r.json().catch(() => null);
        if (err?.error?.code === 2004) continue;                         // demasiado lejos para alternativas
        console.warn(`km: ORS respondió 400: ${JSON.stringify(err?.error ?? err).slice(0, 120)}`); return "error";
      }
      if (!r.ok) { console.warn(`km: ORS respondió ${r.status}`); await r.body?.cancel(); return "error"; }
      const ds = ((await r.json()).routes || []).map((x: GeoHit) => x?.summary?.distance).filter((x: unknown) => typeof x === "number");
      if (!ds.length) return null;
      const km = Math.round(Math.min(...ds) / 1000);
      await saveKm(db, a, b, km);
      return km;
    }
    return null;
  } catch (e) { console.warn(`km: ORS falló: ${(e as Error).message}`); return "error"; }
}

// Reserva: ORS Matrix, una petición con hasta MATRIX_MAX destinos (cupo propio, aparte de las rutas). Solo da la
// ruta más rápida: esos km se marcan 'rapida' y se recalculan con la corta cuando vuelva a haber cupo.
// Devuelve los km de cada destino (null = sin ruta posible) o el fallo.
const MATRIX_MAX = 49;
async function matrixKm(a: [number, number], dests: [number, number][], key: string, deadline: number): Promise<(number | null)[] | Fail> {
  await paceOrs();
  try {
    const r = await fetch("https://api.openrouteservice.org/v2/matrix/driving-car", {
      method: "POST", signal: AbortSignal.timeout(Math.max(3000, Math.min(20_000, deadline - Date.now()))),
      headers: { "Authorization": key, "Content-Type": "application/json" },
      body: JSON.stringify({ locations: [a, ...dests], sources: [0], destinations: dests.map((_, i) => i + 1), metrics: ["distance"], units: "km" }),
    });
    if (r.status === 403 || r.status === 429) { console.warn(`km: ORS Matrix sin cupo (${r.status})`); await r.body?.cancel(); return "quota"; }
    if (!r.ok) { lastServiceError = `ORS Matrix ${r.status}: ${(await r.text()).slice(0, 120)}`; console.warn(`km: ${lastServiceError}`); return "error"; }
    const row = (await r.json())?.distances?.[0];
    if (!Array.isArray(row) || row.length !== dests.length) return "error";
    return row.map((x: unknown) => (typeof x === "number" ? Math.round(x) : null));
  } catch (e) { console.warn(`km: ORS Matrix falló: ${(e as Error).message}`); return "error"; }
}

// Ubica un pabellón: primero la calle (con código postal y población); solo si la calle no existe, el centro de la población.
export async function locate(db: SupabaseClient, address: string): Promise<{ at: [number, number]; source: string } | null | "error"> {
  const clean = address.replace(/\\(['"])/g, "$1").replace(/,\s*(ESPA[ÑN]A|SPAIN)\s*$/i, "").trim();
  if (!clean) return null;
  const parts = clean.split(",").map((s) => s.trim());
  const cp = clean.match(/(\d{5})\s+([^,]+)/);
  const town = cp?.[2].trim();
  const street = parts[0] + (/^\d/.test(parts[1] || "") ? " " + parts[1] : "");
  // Una calle con el mismo nombre en otro municipio no vale: tiene que coincidir el código postal o la población.
  // iSquad a veces pone mal la población ("08880 BARCELONA" es Cubelles): si coincide solo el nombre de la población,
  // el código postal del resultado tiene que ser al menos de la misma zona (mismos 3 primeros dígitos).
  const sameTown = (h: GeoHit) => {
    const p = h.properties || {};
    if (!cp || p.postcode === cp[1]) return true;
    if (p.postcode && String(p.postcode).slice(0, 3) !== cp[1].slice(0, 3)) return false;
    return [p.city, p.locality, p.district, p.county].some((x) => x && (norm(x).includes(norm(town!)) || norm(town!).includes(norm(x))));
  };
  let b = await geocode(db, cp ? `${street}, ${cp[1]} ${town}` : clean, false, sameTown);
  // Sin la población, por si es la que está mal.
  if (b === null && cp) b = await geocode(db, `${street}, ${cp[1]}`, false, sameTown);
  if (b === "error") return "error";   // no se baja a la población por un fallo pasajero
  if (b) return { at: b.at, source: b.exact ? "direccion" : "poblacion" };
  if (!town) return null;
  // Población: primero la del código postal, que es más fiable que el nombre que trae iSquad.
  if (cp) {
    const z = await geocode(db, cp[1], false, (h: GeoHit) => h.properties?.name === cp[1] || h.properties?.postcode === cp[1]);
    if (z === "error") return "error";
    if (z) return { at: z.at, source: "poblacion" };
  }
  const t = await geocode(db, town, true);
  if (t === "error") return "error";
  return t ? { at: t.at, source: "poblacion" } : null;
}

// Candado global (fila km_lock): si otra función ya está calculando km, esta pasada no hace nada.
async function takeLock(db: SupabaseClient, holder: string, until: number) {
  const { data } = await db.from("km_lock").update({ holder, until: new Date(until).toISOString() })
    .eq("id", 1).lt("until", new Date().toISOString()).select("id");
  return !!data?.length;
}
const dropLock = (db: SupabaseClient, holder: string) =>
  db.from("km_lock").update({ until: new Date(0).toISOString() }).eq("id", 1).eq("holder", holder);

// Km de ida de los pabellones que aún no los tienen, hasta la hora límite. Los que no se encuentran no se
// reintentan hasta pasada una semana (o antes si el árbitro cambia de población). Los fallos del servicio
// no cuentan como intento; si ORS dice que no queda cupo, se para.
// Devuelve un resumen de la pasada; "quota" si ORS ha dicho que no queda cupo, para que el cron no siga con los demás.
export async function fillKm(db: SupabaseClient, userId: string, deadline: number): Promise<string> {
  const key = Deno.env.get("ORS_KEY"); if (!key) return "sin ORS_KEY"; if (Date.now() > deadline) return "sin tiempo";
  const holder = crypto.randomUUID();
  // Si otra función está calculando, se espera turno (p. ej. dos altas seguidas) mientras quede tiempo.
  // El candado dura la hora límite + 60 s: ninguna fase empieza una llamada que pueda acabar después de la hora límite
  // más de unos 30 s, así que no caduca con el titular vivo.
  while (!await takeLock(db, holder, deadline + 60_000)) {
    if (Date.now() > deadline - 20_000) { console.warn("km: candado ocupado, se deja para la siguiente pasada"); return "candado ocupado"; }
    await sleep(3000);
  }
  try {
    const { data: prof } = await db.from("profiles").select("origin, origin_lon, origin_lat").eq("user_id", userId).maybeSingle();
    if (!prof?.origin) return "sin población";
    let a: [number, number] | null = prof.origin_lon != null ? [prof.origin_lon, prof.origin_lat] : null;
    if (!a) {
      const o = await geocode(db, prof.origin, true);
      if (!o || o === "error") { console.warn(`km: origen no ubicado (${o === "error" ? "error del servicio" : "no encontrado"})`); return o === "error" ? `origen: ${lastServiceError}` : "origen no encontrado"; }
      a = o.at;
      await db.from("profiles").update({ origin_lon: a[0], origin_lat: a[1] }).eq("user_id", userId).eq("origin", prof.origin);
    }
    const since = new Date(Date.now() - RETRY_AFTER_MS).toISOString();
    const { data: todo, error: te } = await db.from("venues").select("venue_key").eq("user_id", userId).is("km", null)
      .or(`km_tried_at.is.null,km_tried_at.lt.${since}`);
    if (te) { console.warn(`km: no se pudieron leer los pabellones: ${te.message}`); return `error leyendo pabellones: ${te.message}`; }
    let errors = 0, done = 0, missing = 0;
    const now = () => new Date().toISOString();
    const tried = (k: string) => db.from("venues").update({ km_tried_at: now() }).eq("user_id", userId).eq("venue_key", k).is("km", null);
    const put = (k: string, km: number, source: string, rule = "corta") =>
      db.from("venues").update({ km, km_source: source, km_rule: rule, km_tried_at: now() }).eq("user_id", userId).eq("venue_key", k).is("km", null);
    const originStill = async () =>
      (await db.from("profiles").select("origin").eq("user_id", userId).maybeSingle()).data?.origin === prof.origin;

    // 1) Ubicar los pabellones (Photon, con caché). Orden aleatorio: uno que falle siempre no bloquea a los demás.
    //    Se reservan 30 s al final para las distancias (una ubicación tarda como mucho unos 21 s).
    const order = (todo || []).map((v) => v.venue_key).sort(() => Math.random() - 0.5);
    const located: { k: string; at: [number, number]; source: string }[] = [];
    for (const k of order) {
      if (Date.now() > deadline - 30_000 || errors >= 3) break;
      // Dirección del pabellón: un partido cualquiera de ese pabellón (eq, no in: las claves llevan comas y apóstrofos).
      const { data: m } = await db.from("matches").select("addr, venue").eq("user_id", userId).eq("venue_key", k).limit(1).maybeSingle();
      if (!m) continue;
      const r = await locate(db, m.addr || m.venue);
      if (r === "error") { errors++; continue; }
      errors = 0;
      if (r) located.push({ k, ...r }); else { missing++; await tried(k); }
    }
    // Si el árbitro ha cambiado de población a mitad, estos km ya no valen (el trigger deja los pabellones para reintentar).
    let quota = false, routesOut = false, routeErrors = 0, originChanged = false, refined = 0;
    if (located.length && await originStill()) {
      // 2) Distancias: la ruta más corta (caché compartida o ruta suelta) mientras quede tiempo y cupo.
      const need: typeof located = [];
      for (const [j, v] of located.entries()) {
        if (routesOut || Date.now() > deadline - 12_000 || routeErrors >= 3) { need.push(v); continue; }
        if (j % 5 === 4 && !await originStill()) { originChanged = true; break; }
        const d = await driveKm(db, a, v.at, key);
        if (d === "quota") { routesOut = true; need.push(v); continue; }
        if (d === "error") { routeErrors++; need.push(v); continue; }
        routeErrors = 0;
        if (d == null) { missing++; await tried(v.k); } else { await put(v.k, d, v.source); done++; }
      }
      // 3) Reserva si no quedan rutas: Matrix (la más rápida) para no dejar el pabellón sin km; se afina después.
      for (let i = 0; !originChanged && i < need.length; i += MATRIX_MAX) {
        if (Date.now() > deadline - 5_000) break;
        const chunk = need.slice(i, i + MATRIX_MAX);
        const res: (number | null)[] | Fail = quota ? "quota" : await matrixKm(a, chunk.map((v) => v.at), key, deadline);
        if (res === "quota") quota = true;
        if (!Array.isArray(res)) continue;
        if (!await originStill()) { originChanged = true; break; }   // la población ha cambiado mientras se calculaba
        for (const [j, v] of chunk.entries()) {
          const km = res[j];
          if (km == null) { missing++; await tried(v.k); continue; }
          await put(v.k, km, v.source, "rapida"); done++;
        }
      }
    }
    // 4) Con el tiempo y el cupo que sobren, se recalculan con la ruta corta los km que aún no lo son
    //    (los de antes del cambio y los de Matrix). Los puestos a mano no se tocan.
    if (!routesOut && !originChanged && routeErrors < 3 && Date.now() < deadline - 15_000) {
      const { data: rows } = await db.from("venues").select("venue_key, km, km_source").eq("user_id", userId).not("km", "is", null)
        .or("km_rule.is.null,km_rule.neq.corta");
      const old = (rows || []).filter((o) => o.km_source !== "manual").slice(0, 60);
      for (const [j, o] of old.entries()) {
        if (Date.now() > deadline - 15_000 || routeErrors >= 3) break;
        if (j % 5 === 4 && !await originStill()) { originChanged = true; break; }
        const { data: m } = await db.from("matches").select("addr, venue").eq("user_id", userId).eq("venue_key", o.venue_key).limit(1).maybeSingle();
        if (!m) continue;
        const r = await locate(db, m.addr || m.venue);
        if (r === "error") { routeErrors++; continue; }
        const d = r ? await driveKm(db, a, r.at, key) : null;
        if (d === "quota") { routesOut = true; break; }
        if (d === "error") { routeErrors++; continue; }
        routeErrors = 0;
        if (d == null || !r) continue;
        // Solo si nadie lo ha cambiado mientras tanto (km a mano o vaciado).
        await db.from("venues").update({ km: d, km_source: r.source, km_rule: "corta" }).eq("user_id", userId).eq("venue_key", o.venue_key)
          .eq("km", o.km).or("km_source.is.null,km_source.neq.manual");
        refined++;
      }
    }
    // "quota" solo si no queda cupo ni en Matrix ni en rutas: así el cron no deja sin km al resto de árbitros sin motivo.
    if (quota && routesOut) return "quota";
    return `${todo?.length ?? 0} pendientes: ${done} calculados, ${missing} no encontrados` +
      `${errors ? `, ${errors} errores al ubicar` : ""}${routeErrors ? `, ${routeErrors} errores en rutas` : ""}` +
      `${refined ? `, ${refined} recalculados con la ruta corta` : ""}` +
      `${quota ? ", Matrix sin cupo" : ""}${routesOut ? ", rutas sin cupo" : ""}${originChanged ? ", población cambiada" : ""}`;
  } finally { await dropLock(db, holder); }
}

export async function storeMatches(db: SupabaseClient, userId: string, matches: WithStaff[]) {
  const now = new Date().toISOString();
  if (matches.length) {
    // Solo se envían las columnas que vienen de iSquad: lo que el árbitro marca a mano no se toca.
    const { error } = await db.from("matches").upsert(
      matches.map(({ staff: _s, ...m }) => ({ ...m, user_id: userId, last_seen: now })),
      { onConflict: "user_id,id" },
    );
    if (error) throw error;
  }
  // Rol y equipo arbitral, solo de los partidos cuya designación se ha podido leer.
  for (const m of matches) {
    if (m.staff) await db.from("matches").update({ ...m.staff, staff_checked: now }).eq("user_id", userId).eq("id", m.id);
  }
  const { data: known } = await db.from("venues").select("venue_key").eq("user_id", userId);
  const have = new Set((known || []).map((v) => v.venue_key));
  const fresh = new Map<string, ScrapedMatch>();
  for (const m of matches) if (!have.has(m.venue_key) && !fresh.has(m.venue_key)) fresh.set(m.venue_key, m);
  // Pabellones que ya no usa ningún partido (p. ej. cambió la dirección) y sin km: sobran. Se comprueban uno a uno
  // (eq, no in: PostgREST trata la barra invertida como escape) para no depender de leer todos los partidos.
  const seen = new Set(matches.map((m) => m.venue_key));
  for (const k of [...have].filter((k) => !seen.has(k))) {
    const { data: still } = await db.from("matches").select("id").eq("user_id", userId).eq("venue_key", k).limit(1);
    if (!still?.length) await db.from("venues").delete().eq("user_id", userId).eq("venue_key", k).is("km", null);
  }
  if (fresh.size) {
    await db.from("venues").insert([...fresh].map(([k, m]) => ({ user_id: userId, venue_key: k, label: venueLabel(m.venue, m.addr), km: null })));
  }
  await db.from("profiles").update({ last_sync: now, last_error: null }).eq("user_id", userId);
}

// Trabajo que sigue tras responder (Supabase mantiene viva la función hasta que acaba).
// deno-lint-ignore no-explicit-any
export const background = (p: Promise<unknown>) => { const rt = (globalThis as any).EdgeRuntime; rt?.waitUntil ? rt.waitUntil(p.catch(() => {})) : p.catch(() => {}); };

// km: "wait" = calcular los km antes de volver; "background" = después de responder; "none" = no calcularlos aquí.
// deadline: hora límite de la petición (cuenta desde que llegó, no desde que empieza el cálculo de km).
export async function syncUser(db: SupabaseClient, userId: string, opts: { km?: "wait" | "background" | "none"; deadline: number }) {
  const { data: cred } = await db.from("isquad_credentials").select("secret").eq("user_id", userId).maybeSingle();
  const { data: prof } = await db.from("profiles").select("isquad_login").eq("user_id", userId).maybeSingle();
  if (!cred || !prof) return { ok: false, error: "sin_credenciales" };
  try {
    // El equipo arbitral de un partido ya jugado no cambia: se lee una vez. Los próximos y recientes, en cada pasada.
    const checked = new Set<string>();
    for (let from = 0; ; from += 1000) {   // PostgREST devuelve como mucho 1000 filas por consulta
      const { data } = await db.from("matches").select("id").eq("user_id", userId).not("staff_checked", "is", null)
        .order("id").range(from, from + 999);
      for (const m of data || []) checked.add(m.id);
      if (!data || data.length < 1000) break;
    }
    const recent = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
    const matches = await fetchDesignaciones(prof.isquad_login, await decrypt(cred.secret), {
      needStaff: (m: ScrapedMatch) => !checked.has(m.id) || m.date >= recent, deadline: opts.deadline,
    });
    await storeMatches(db, userId, matches);
    if (opts.km === "wait") await fillKm(db, userId, opts.deadline);
    else if (opts.km === "background") background(fillKm(db, userId, opts.deadline));
    return { ok: true, count: matches.length };
  } catch (e) {
    const code = e instanceof IsquadAuthError ? "credenciales" : "conexion";
    await db.from("profiles").update({ last_error: code }).eq("user_id", userId);
    return { ok: false, error: code };
  }
}
