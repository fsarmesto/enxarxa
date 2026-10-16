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

/* Km de ida por carretera. Las direcciones y poblaciones se buscan en Nominatim (OpenStreetMap, sin cupo diario
   pero máximo 1 consulta por segundo) y la ruta se calcula con OpenRouteService (secret ORS_KEY, 200 rutas al día).
   Las dos cosas se guardan en caché compartida entre árbitros. */
type Place = { at: [number, number]; exact: boolean };
// deno-lint-ignore no-explicit-any
type NomiHit = any;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const UA = "liquidacion-arbitral-fcvb/1.0 (https://github.com/fsarmesto/liquidacion-arbitral-fcvb)";
const CAT_BOX = "&viewbox=0.15,42.9,3.35,40.5&bounded=1"; // solo Catalunya
const NOMI_GAP_MS = 1100, ORS_GAP_MS = 1600;              // 1/s en Nominatim; 40/min en ORS
// Lo no encontrado se vuelve a buscar a la semana, igual que el reintento de cada pabellón.
const RETRY_AFTER_MS = 7 * 864e5, NOT_FOUND_TTL_MS = RETRY_AFTER_MS;
const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

// Cada llamada reserva su turno antes de esperar: así dos peticiones a la vez no salen juntas.
function pacer(gap: number) {
  let next = 0;
  return async () => { const now = Date.now(), at = Math.max(now, next); next = at + gap; if (at > now) await sleep(at - now); };
}
const paceNomi = pacer(NOMI_GAP_MS), paceOrs = pacer(ORS_GAP_MS);

// "error" = fallo de red o del servicio: no se guarda en caché ni cuenta como intento. null = no encontrado.
type Fail = "error" | "quota";
async function nominatim(text: string, town: boolean): Promise<NomiHit | null | "error"> {
  await paceNomi();
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=es${CAT_BOX}` +
      (town ? "&featureType=settlement" : "") + `&q=${encodeURIComponent(text)}`,
      { headers: { "User-Agent": UA, "Accept-Language": "ca,es" }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) { await r.body?.cancel(); return "error"; }
    return (await r.json())?.[0] ?? null;
  } catch { return "error"; }
}

async function geocode(db: SupabaseClient, text: string, town: boolean, accept?: (h: NomiHit) => boolean): Promise<Place | null | "error"> {
  const query = (town ? "town:" : "addr:") + norm(text);
  const { data: c } = await db.from("geo_cache").select("lon, lat, exact, found, created_at").eq("query", query).maybeSingle();
  if (c && (c.found || Date.now() - new Date(c.created_at).getTime() < NOT_FOUND_TTL_MS)) {
    return c.found ? { at: [c.lon, c.lat], exact: c.exact } : null;
  }
  let hit = await nominatim(text, town);
  if (hit === "error") return "error";
  if (hit && accept && !accept(hit)) hit = null;
  // rank 26 = calle, 30 = portal o edificio: eso es dirección exacta; lo demás, aproximado.
  const place: Place | null = hit ? { at: [+hit.lon, +hit.lat], exact: !town && hit.place_rank >= 26 } : null;
  await db.from("geo_cache").upsert({ query, lon: place?.at[0] ?? null, lat: place?.at[1] ?? null, exact: place?.exact ?? false,
    found: !!place, created_at: new Date().toISOString() });
  return place;
}

// "quota" = ORS rechaza por cupo o ritmo (403/429): hay que parar la pasada.
async function driveKm(db: SupabaseClient, a: [number, number], b: [number, number], key: string): Promise<number | null | Fail> {
  const k = `${a.map((x) => x.toFixed(4)).join(",")}>${b.map((x) => x.toFixed(4)).join(",")}`;
  const { data: c } = await db.from("route_cache").select("km").eq("key", k).maybeSingle();
  if (c) return +c.km;
  await paceOrs();
  try {
    const r = await fetch(`https://api.openrouteservice.org/v2/directions/driving-car?api_key=${key}&start=${a.join(",")}&end=${b.join(",")}`,
      { signal: AbortSignal.timeout(10_000) });
    if (r.status === 403 || r.status === 429) { await r.body?.cancel(); return "quota"; }
    if (r.status === 404) { await r.body?.cancel(); return null; }   // sin ruta posible entre los dos puntos
    if (!r.ok) { await r.body?.cancel(); return "error"; }
    const m = (await r.json()).features?.[0]?.properties?.summary?.distance;
    if (typeof m !== "number") return null;
    const km = Math.round(m / 1000);
    await db.from("route_cache").upsert({ key: k, km });
    return km;
  } catch { return "error"; }
}

// Primero la calle (con código postal y población); solo si la calle no existe, el centro de la población.
export async function route(db: SupabaseClient, a: [number, number], address: string, key: string): Promise<{ km: number; source: string } | null | Fail> {
  const clean = address.replace(/\\(['"])/g, "$1").replace(/,\s*(ESPA[ÑN]A|SPAIN)\s*$/i, "").trim();
  if (!clean) return null;
  const parts = clean.split(",").map((s) => s.trim());
  const cp = clean.match(/(\d{5})\s+([^,]+)/);
  const town = cp?.[2].trim();
  const street = parts[0] + (/^\d/.test(parts[1] || "") ? " " + parts[1] : "");
  // Una calle con el mismo nombre en otro municipio no vale: tiene que coincidir el código postal o la población.
  const sameTown = (h: NomiHit) => !cp || h.address?.postcode === cp[1] || norm(h.display_name).includes(norm(town!));
  const tries: [string, boolean][] = [[cp ? `${street}, ${cp[1]} ${town}` : clean, false]];
  if (town) tries.push([town, true]);
  for (const [text, isTown] of tries) {
    const b = await geocode(db, text, isTown, isTown ? undefined : sameTown);
    if (b === "error") return "error";   // no se baja a la población por un fallo pasajero
    if (!b) continue;
    const km = await driveKm(db, a, b.at, key);
    if (km === "error" || km === "quota") return km;
    return km == null ? null : { km, source: b.exact ? "direccion" : "poblacion" };
  }
  return null;
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
// Devuelve "quota" si ORS ha dicho que no queda cupo, para que el cron no siga con los demás usuarios.
export async function fillKm(db: SupabaseClient, userId: string, deadline: number): Promise<"quota" | void> {
  const key = Deno.env.get("ORS_KEY"); if (!key || Date.now() > deadline) return;
  const holder = crypto.randomUUID();
  // Si otra función está calculando, se espera turno (p. ej. dos altas seguidas) mientras quede tiempo.
  // El candado dura la hora límite + 30 s: cada llamada tiene 10 s de tiempo máximo, así que no caduca con el titular vivo.
  while (!await takeLock(db, holder, deadline + 30_000)) {
    if (Date.now() > deadline - 20_000) return;
    await sleep(3000);
  }
  try {
    const { data: prof } = await db.from("profiles").select("origin, origin_lon, origin_lat").eq("user_id", userId).maybeSingle();
    if (!prof?.origin) return;
    let a: [number, number] | null = prof.origin_lon != null ? [prof.origin_lon, prof.origin_lat] : null;
    if (!a) {
      const o = await geocode(db, prof.origin, true);
      if (!o || o === "error") return;
      a = o.at;
      await db.from("profiles").update({ origin_lon: a[0], origin_lat: a[1] }).eq("user_id", userId).eq("origin", prof.origin);
    }
    const since = new Date(Date.now() - RETRY_AFTER_MS).toISOString();
    const { data: todo } = await db.from("venues").select("venue_key").eq("user_id", userId).is("km", null)
      .or(`km_tried_at.is.null,km_tried_at.lt.${since}`);
    let errors = 0;
    // Orden aleatorio: un pabellón que falle siempre no bloquea a los demás en cada pasada.
    const order = (todo || []).map((v) => v.venue_key).sort(() => Math.random() - 0.5);
    for (const k of order) {
      if (Date.now() > deadline || errors >= 3) break;
      // Si el árbitro cambia de población a mitad, estos km ya no valen: se para (el trigger deja los pabellones para reintentar).
      const { data: cur } = await db.from("profiles").select("origin").eq("user_id", userId).maybeSingle();
      if (cur?.origin !== prof.origin) break;
      // Dirección del pabellón: un partido cualquiera de ese pabellón (eq, no in: las claves llevan comas y apóstrofos).
      const { data: m } = await db.from("matches").select("addr, venue").eq("user_id", userId).eq("venue_key", k).limit(1).maybeSingle();
      if (!m) continue;
      const r = await route(db, a, m.addr || m.venue, key);
      if (r === "quota") return "quota";
      if (r === "error") { errors++; continue; }
      errors = 0;
      const now = new Date().toISOString();
      await db.from("venues").update(r ? { km: r.km, km_source: r.source, km_tried_at: now } : { km_tried_at: now })
        .eq("user_id", userId).eq("venue_key", k).is("km", null);
    }
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
