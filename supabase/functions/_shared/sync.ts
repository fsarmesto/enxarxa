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

/* Km de ida por carretera con OpenRouteService (opcional: secret ORS_KEY). */
type Place = { at: [number, number]; exact: boolean };
// Si no reconoce la calle, el buscador suele devolver la población o el código postal: eso cuenta como aproximado.
const EXACT_LAYERS = new Set(["address", "street", "venue"]);
async function geocode(text: string, key: string): Promise<Place | null> {
  const u = `https://api.openrouteservice.org/geocode/search?api_key=${key}&size=1&boundary.country=ES&text=${encodeURIComponent(text)}`;
  const r = await fetch(u); if (!r.ok) return null;
  const f = (await r.json()).features?.[0];
  return f ? { at: f.geometry.coordinates, exact: EXACT_LAYERS.has(f.properties?.layer) } : null;
}
// El plan gratuito de ORS admite 40 rutas por minuto: se espacian las consultas y se limita cada pasada.
const ORS_GAP_MS = 1600, ORS_MAX_PER_RUN = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function driveKm(a: [number, number], b: [number, number], key: string): Promise<number | null> {
  const r = await fetch(`https://api.openrouteservice.org/v2/directions/driving-car?api_key=${key}&start=${a.join(",")}&end=${b.join(",")}`);
  if (!r.ok) return null;
  const m = (await r.json()).features?.[0]?.properties?.summary?.distance;
  return typeof m === "number" ? Math.round(m / 1000) : null;
}

// Primero la dirección exacta; si no se encuentra, el centro de la población (código postal + nombre, y luego solo el nombre).
export async function route(a: [number, number], address: string, key: string): Promise<{ km: number; source: string } | null> {
  try {
    const clean = address.replace(/\\(['"])/g, "$1").replace(/,\s*(ESPA[ÑN]A|SPAIN)\s*$/i, "");
    const town = clean.match(/(\d{5})\s+([^,]+)/);
    const tries = [clean];
    if (town) tries.push(`${town[1]} ${town[2].trim()}`, town[2].trim() + ", Catalunya");
    for (const [i, text] of tries.entries()) {
      const b = await geocode(text, key);
      if (!b) continue;
      const km = await driveKm(a, b.at, key);
      return km == null ? null : { km, source: i === 0 && b.exact ? "direccion" : "poblacion" };
    }
    return null;
  } catch { return null; }
}

// Km de ida de los pabellones que aún no los tienen. Los que no salgan se reintentan en la siguiente sincronización.
export async function fillKm(db: SupabaseClient, userId: string, origin: string) {
  const key = Deno.env.get("ORS_KEY"); if (!key) return;
  const { data: todo } = await db.from("venues").select("venue_key").eq("user_id", userId).is("km", null);
  if (!todo?.length) return;
  const { data: ms } = await db.from("matches").select("venue_key, addr, venue").eq("user_id", userId)
    .in("venue_key", todo.map((v) => v.venue_key));
  const where = new Map<string, string>();
  for (const m of ms || []) if (!where.has(m.venue_key)) where.set(m.venue_key, m.addr || m.venue);
  const a = (await geocode(origin + ", Catalunya", key).catch(() => null))?.at;
  if (!a) return;
  let n = 0;
  for (const [k, address] of where) {
    if (n++ >= ORS_MAX_PER_RUN) break;
    if (n > 1) await sleep(ORS_GAP_MS);
    const r = await route(a, address, key);
    if (r) await db.from("venues").update({ km: r.km, km_source: r.source }).eq("user_id", userId).eq("venue_key", k).is("km", null);
  }
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
  // Pabellones que ya no usa ningún partido (p. ej. cambió la dirección) y sin km: sobran.
  const used = new Set(matches.map((m) => m.venue_key));
  const { data: allMs } = await db.from("matches").select("venue_key").eq("user_id", userId);
  for (const m of allMs || []) used.add(m.venue_key);
  const orphans = [...have].filter((k) => !used.has(k));
  // Uno a uno con eq: dentro de in(...) PostgREST trata la barra invertida como escape y no coincidirían.
  for (const k of orphans) await db.from("venues").delete().eq("user_id", userId).eq("venue_key", k).is("km", null);
  if (fresh.size) {
    await db.from("venues").insert([...fresh].map(([k, m]) => ({ user_id: userId, venue_key: k, label: venueLabel(m.venue, m.addr), km: null })));
  }
  await db.from("profiles").update({ last_sync: now, last_error: null }).eq("user_id", userId);
}

// Trabajo que sigue tras responder (Supabase mantiene viva la función hasta que acaba).
// deno-lint-ignore no-explicit-any
export const background = (p: Promise<unknown>) => { const rt = (globalThis as any).EdgeRuntime; rt?.waitUntil ? rt.waitUntil(p.catch(() => {})) : p.catch(() => {}); };

export async function syncUser(db: SupabaseClient, userId: string, opts: { waitKm?: boolean } = {}) {
  const { data: cred } = await db.from("isquad_credentials").select("secret").eq("user_id", userId).maybeSingle();
  const { data: prof } = await db.from("profiles").select("isquad_login, origin").eq("user_id", userId).maybeSingle();
  if (!cred || !prof) return { ok: false, error: "sin_credenciales" };
  try {
    // El equipo arbitral de un partido ya jugado no cambia: se lee una vez. Los próximos y recientes, en cada pasada.
    const { data: ex } = await db.from("matches").select("id, staff_checked").eq("user_id", userId);
    const checked = new Set((ex || []).filter((m) => m.staff_checked).map((m) => m.id));
    const recent = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
    const matches = await fetchDesignaciones(prof.isquad_login, await decrypt(cred.secret), {
      needStaff: (m: ScrapedMatch) => !checked.has(m.id) || m.date >= recent,
    });
    await storeMatches(db, userId, matches);
    if (opts.waitKm) await fillKm(db, userId, prof.origin); else background(fillKm(db, userId, prof.origin));
    return { ok: true, count: matches.length };
  } catch (e) {
    const code = e instanceof IsquadAuthError ? "credenciales" : "conexion";
    await db.from("profiles").update({ last_error: code }).eq("user_id", userId);
    return { ok: false, error: code };
  }
}
