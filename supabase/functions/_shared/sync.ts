import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { decrypt } from "./crypto.ts";
import { fetchDesignaciones, IsquadAuthError, ScrapedMatch, venueLabel } from "./isquad.ts";

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
async function geocode(text: string, key: string): Promise<[number, number] | null> {
  const u = `https://api.openrouteservice.org/geocode/search?api_key=${key}&size=1&boundary.country=ES&text=${encodeURIComponent(text)}`;
  const r = await fetch(u); if (!r.ok) return null;
  const f = (await r.json()).features?.[0]; return f ? f.geometry.coordinates : null;
}
export async function roadKm(origin: string, address: string): Promise<number | null> {
  const key = Deno.env.get("ORS_KEY"); if (!key) return null;
  try {
    const clean = address.replace(/,\s*ESPA[ÑN]A\s*$/i, "");
    const [a, b] = await Promise.all([geocode(origin + ", Catalunya", key), geocode(clean, key)]);
    if (!a || !b) return null;
    const r = await fetch(`https://api.openrouteservice.org/v2/directions/driving-car?api_key=${key}&start=${a.join(",")}&end=${b.join(",")}`);
    if (!r.ok) return null;
    const m = (await r.json()).features?.[0]?.properties?.summary?.distance;
    return typeof m === "number" ? Math.round(m / 1000) : null;
  } catch { return null; }
}

export async function storeMatches(db: SupabaseClient, userId: string, origin: string, matches: ScrapedMatch[]) {
  const now = new Date().toISOString();
  if (matches.length) {
    // Solo se envían las columnas que vienen de iSquad: lo que el árbitro marca a mano no se toca.
    const { error } = await db.from("matches").upsert(
      matches.map((m) => ({ ...m, user_id: userId, last_seen: now })),
      { onConflict: "user_id,id" },
    );
    if (error) throw error;
  }
  const { data: known } = await db.from("venues").select("venue_key").eq("user_id", userId);
  const have = new Set((known || []).map((v) => v.venue_key));
  const fresh = new Map<string, ScrapedMatch>();
  for (const m of matches) if (!have.has(m.venue_key) && !fresh.has(m.venue_key)) fresh.set(m.venue_key, m);
  for (const [k, m] of fresh) {
    const km = await roadKm(origin, m.addr || m.venue);
    await db.from("venues").insert({ user_id: userId, venue_key: k, label: venueLabel(m.venue, m.addr), km });
  }
  await db.from("profiles").update({ last_sync: now, last_error: null }).eq("user_id", userId);
}

export async function syncUser(db: SupabaseClient, userId: string) {
  const { data: cred } = await db.from("isquad_credentials").select("secret").eq("user_id", userId).maybeSingle();
  const { data: prof } = await db.from("profiles").select("isquad_login, origin").eq("user_id", userId).maybeSingle();
  if (!cred || !prof) return { ok: false, error: "sin_credenciales" };
  try {
    const matches = await fetchDesignaciones(prof.isquad_login, await decrypt(cred.secret));
    await storeMatches(db, userId, prof.origin, matches);
    return { ok: true, count: matches.length };
  } catch (e) {
    const code = e instanceof IsquadAuthError ? "credenciales" : "conexion";
    await db.from("profiles").update({ last_error: code }).eq("user_id", userId);
    return { ok: false, error: code };
  }
}
