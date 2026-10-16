// Entrar con el usuario y contraseña de iSquad. Comprueba las credenciales contra iSquad,
// crea la cuenta si es la primera vez, guarda la contraseña cifrada y devuelve un token de sesión.
import { encrypt } from "../_shared/crypto.ts";
import { fetchDesignaciones, IsquadAuthError, ScrapedMatch } from "../_shared/isquad.ts";
import { admin, background, cors, json, storeMatches, syncUser } from "../_shared/sync.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: { login?: string; password?: string; origin?: string; consent?: boolean };
  try { body = await req.json(); } catch { return json({ error: "Petición no válida" }, 400); }
  const login = (body.login || "").trim(), password = body.password || "";
  if (!login || !password) return json({ error: "Escribe tu usuario y contraseña de iSquad" }, 400);
  const key = login.toLowerCase();

  const allow = (Deno.env.get("ALLOWED_LOGINS") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allow.length && !allow.includes(key)) return json({ error: "Esta cuenta no tiene acceso. Pide a quien gestiona la app que te añada." }, 403);

  let matches: ScrapedMatch[];
  try { matches = await fetchDesignaciones(login, password); }
  catch (e) {
    if (e instanceof IsquadAuthError) return json({ error: "iSquad no acepta ese usuario y contraseña" }, 401);
    return json({ error: "No se ha podido conectar con iSquad. Prueba en unos minutos." }, 502);
  }

  const db = admin();
  const { data: existing } = await db.from("profiles").select("user_id, origin").eq("login_key", key).maybeSingle();
  if (!existing && (!body.consent || !(body.origin || "").trim())) return json({ needSetup: true });

  // Cuenta interna de Supabase: no se envía ningún correo, el login real es el de iSquad.
  const email = key.includes("@") ? key : `${key.replace(/[^a-z0-9._-]/g, "")}@isquad-user.example.com`;
  if (!existing) {
    const { error } = await db.auth.admin.createUser({ email, email_confirm: true });
    if (error && !/already|registered|exists/i.test(error.message)) return json({ error: "No se ha podido crear la cuenta" }, 500);
  }
  const { data: link, error: le } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (le || !link?.user) return json({ error: "No se ha podido iniciar sesión" }, 500);
  const userId = link.user.id;

  const origin = existing?.origin || body.origin!.trim();
  const { error: pe } = await db.from("profiles").upsert(
    { user_id: userId, login_key: key, isquad_login: login, origin, last_error: null }, { onConflict: "user_id" });
  if (pe) return json({ error: "No se ha podido guardar el perfil" }, 500);
  await db.from("isquad_credentials").upsert({ user_id: userId, secret: await encrypt(password), updated_at: new Date().toISOString() });
  // Los partidos se guardan ya; el equipo arbitral de cada designación y los km se leen después, sin hacer esperar.
  try { await storeMatches(db, userId, matches); background(syncUser(db, userId, { waitKm: true })); }
  catch (_) { /* la sincronización programada lo reintentará */ }

  return json({ token_hash: link.properties.hashed_token });
});
