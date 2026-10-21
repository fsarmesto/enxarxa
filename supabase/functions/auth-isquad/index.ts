// Entrar con el usuario y contraseña de iSquad. Comprueba las credenciales contra iSquad,
// crea la cuenta si es la primera vez, guarda la contraseña cifrada y devuelve un token de sesión.
import { encrypt } from "../_shared/crypto.ts";
import { fetchDesignaciones, IsquadAuthError, loginDeportista, ScrapedMatch } from "../_shared/isquad.ts";
import { POLICY_VERSION } from "../_shared/politica.ts";
import { admin, background, cors, json, storeMatches, syncUser } from "../_shared/sync.ts";

// Cuenta nueva: hace falta el consentimiento y la casilla "Tengo 14 años o más" (por debajo, consentimiento de los padres).
const consentNew = () => ({ consent_at: new Date().toISOString(), policy_version: POLICY_VERSION });

// Jugador o entrenador sin licencia de árbitro: cuenta sin contraseña guardada (no hay nada que leer de su iSquad),
// con su nombre y su foto de afiliado para encontrarle en las plantillas. "Sin guardar" no aplica: no hay nada que leer.
async function entrarDeportista(key: string, login: string, dep: { area: string; nombre: string; foto: string }, body: { consent?: boolean; age14?: boolean; save?: boolean }) {
  if (body.save === false) return json({ error: "Sin guardar solo funciona con cuenta de árbitro. Entra normal: de tu cuenta solo se guarda tu nombre." }, 400);
  const db = admin();
  const { data: existing } = await db.from("profiles").select("user_id").eq("login_key", key).maybeSingle();
  if (!existing && (!body.consent || !body.age14)) return json({ needSetup: true, deportista: true });
  const email = key.includes("@") ? key : `${key.replace(/[^a-z0-9._-]/g, "")}@isquad-user.example.com`;
  if (!existing) {
    const { error } = await db.auth.admin.createUser({ email, email_confirm: true });
    if (error && !/already|registered|exists/i.test(error.message)) return json({ error: "No se ha podido crear la cuenta" }, 500);
  }
  const { data: link, error: le } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (le || !link?.user) return json({ error: "No se ha podido iniciar sesión" }, 500);
  const { error: pe } = await db.from("profiles").upsert({ user_id: link.user.id, login_key: key, isquad_login: login, origin: "", tipo: "deportista",
    nombre: dep.nombre || null, foto: dep.foto || null, last_error: null, ...(existing ? {} : consentNew()) }, { onConflict: "user_id" });
  if (pe) return json({ error: "No se ha podido guardar el perfil" }, 500);
  await db.from("isquad_credentials").delete().eq("user_id", link.user.id);   // por si antes era árbitro: nada guardado
  return json({ token_hash: link.properties.hashed_token, deportista: true });
}

Deno.serve(async (req) => {
  const started = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: { login?: string; password?: string; origin?: string; consent?: boolean; age14?: boolean; save?: boolean };
  try { body = await req.json(); } catch { return json({ error: "Petición no válida" }, 400); }
  const login = (body.login || "").trim(), password = body.password || "";
  if (!login || !password) return json({ error: "Escribe tu usuario y contraseña de iSquad" }, 400);
  const key = login.toLowerCase();

  const allow = (Deno.env.get("ALLOWED_LOGINS") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allow.length && !allow.includes(key)) return json({ error: "Esta cuenta no tiene acceso. Pide a quien gestiona la app que te añada." }, 403);

  // Sin guardar: se lee iSquad (partidos, recibos y equipo arbitral) y se devuelve todo al navegador. No se crea
  // cuenta ni se guarda nada (ni usuario, ni contraseña, ni partidos); al cerrar la pestaña desaparece.
  if (body.save === false) {
    let nombre = "";
    try {
      const list = await fetchDesignaciones(login, password, {
        needStaff: () => true, deadline: started + 120_000, onName: (n) => { nombre = n; },
      });
      const now = new Date().toISOString();
      return json({
        guest: true, nombre,
        matches: list.map(({ staff, ...m }) => ({ ...m, ...(staff ?? {}), staff_checked: staff ? now : null, last_seen: now })),
      });
    } catch (e) {
      if (e instanceof IsquadAuthError) return json({ error: "iSquad no acepta ese usuario y contraseña" }, 401);
      return json({ error: "No se ha podido conectar con iSquad. Prueba en unos minutos." }, 502);
    }
  }

  let matches: ScrapedMatch[];
  try { matches = await fetchDesignaciones(login, password); }
  catch (e) {
    if (!(e instanceof IsquadAuthError)) return json({ error: "No se ha podido conectar con iSquad. Prueba en unos minutos." }, 502);
    // No es árbitro (o no entra en esa área): ¿jugador o entrenador? Misma cuenta de iSquad.
    let dep;
    try { dep = await loginDeportista(login, password); }
    catch (e2) {
      if (e2 instanceof IsquadAuthError) return json({ error: "iSquad no acepta ese usuario y contraseña" }, 401);
      return json({ error: "No se ha podido conectar con iSquad. Prueba en unos minutos." }, 502);
    }
    return await entrarDeportista(key, login, dep, body);
  }

  const db = admin();
  const { data: existing } = await db.from("profiles").select("user_id, origin").eq("login_key", key).maybeSingle();
  if (!existing && (!body.consent || !body.age14 || !(body.origin || "").trim())) return json({ needSetup: true });

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
    { user_id: userId, login_key: key, isquad_login: login, origin, last_error: null, ...(existing ? {} : consentNew()) }, { onConflict: "user_id" });
  if (pe) return json({ error: "No se ha podido guardar el perfil" }, 500);
  await db.from("isquad_credentials").upsert({ user_id: userId, secret: await encrypt(password), session: null, session_at: null, updated_at: new Date().toISOString() });
  // Los partidos se guardan ya; el equipo arbitral de cada designación y los km se leen después, sin hacer esperar.
  try { await storeMatches(db, userId, matches); background(syncUser(db, userId, { km: "wait", deadline: started + 130_000 })); }
  catch (_) { /* la sincronización programada lo reintentará */ }

  return json({ token_hash: link.properties.hashed_token });
});
