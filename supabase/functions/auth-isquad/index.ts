// Entrar con el usuario y contraseña de iSquad. Comprueba las credenciales contra iSquad,
// crea la cuenta si es la primera vez, guarda la contraseña cifrada y devuelve un token de sesión.
import { encrypt } from "../_shared/crypto.ts";
import { fetchDesignaciones, IsquadAuthError, loginDeportista, rastro, ScrapedMatch } from "../_shared/isquad.ts";
import { POLICY_VERSION } from "../_shared/politica.ts";
import { admin, background, cors, json, storeMatches, syncUser } from "../_shared/sync.ts";

// Tope de intentos (revisión de seguridad, 27-oct-2026): sin él, cualquiera podría usar esta función para probar
// contraseñas de iSquad sin límite desde nuestros servidores. Cuenta los fallos por usuario (2 en 15 min: desde el
// 4-nov-2026 iSquad bloquea la cuenta al 3r fallo, y no queremos ser nosotros quien la bloquee) y por conexión
// (20 en 1 h; un intento que sale bien no cuenta) en pub_cache, con una huella (no se guarda ni el usuario ni la IP). La ventana empieza en el primer fallo.
// deno-lint-ignore no-explicit-any
type Db = any;
type Tope = { k: string; max: number; ms: number };
const huella = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
// Suma (o resta) en una sola operación de la base de datos (sumar_intento, migración 034): antes se leía, se sumaba y se
// escribía por separado, y muchas peticiones a la vez pasaban todas el tope. Se reserva el intento ANTES de llamar a iSquad.
async function sumar(db: Db, t: Tope, delta: number): Promise<number> {
  const { data, error } = await db.rpc("sumar_intento", { k: t.k, ventana_ms: t.ms, delta });
  if (error) { console.error("sumar_intento", error.message); return 0; }   // sin contador, se entra igual (mejor que nadie pueda)
  return +(data ?? 0);
}

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
  const { error: pe } = await db.from("profiles").upsert({ user_id: link.user.id, login_key: key, isquad_login: login, ...(existing ? {} : { origin: "" }), tipo: "deportista",
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
  const db0 = admin(), ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
  const topes: Tope[] = [{ k: `intentos:${await huella("u:" + key)}`, max: 2, ms: 15 * 60_000 }, { k: `intentos:${await huella("ip:" + ip)}`, max: 20, ms: 3600_000 }];
  // Cada intento cuenta al empezar; si sale bien, se devuelve (el del usuario se borra y el de la conexión resta uno).
  const n = await Promise.all(topes.map((t) => sumar(db0, t, 1)));
  if (n.some((v, i) => v > topes[i].max)) return json({ error: "Demasiados intentos. Prueba de nuevo dentro de un rato." }, 429);
  const malas = () => json({ error: "iSquad no acepta ese usuario y contraseña" }, 401);
  // Lo que dice iSquad cuando no deja entrar (contraseña mala, cuenta bloqueada, verificación en 2 pasos).
  // Diagnóstico (4-nov-2026, iSquad cambió el login): lo que respondió iSquad, sin usuario ni contraseña. Se guarda 3 días.
  const diag = (motivo: string) => db0.from("pub_cache").upsert({ key: `diag-login:${new Date().toISOString()}`, data: { motivo, rastro: [...rastro] }, fetched_at: new Date().toISOString() }).then(() => {}, () => {});
  const porQue = (e: IsquadAuthError) =>
    e.motivo === "bloqueada" ? json({ error: "iSquad ha bloqueado tu cuenta por demasiados intentos. Desbloquéala desde iSquad (\"¿Has olvidado la contraseña?\") y vuelve a probar." }, 401)
    : e.motivo === "doble" ? json({ error: "Tu cuenta de iSquad pide un segundo paso de verificación y EnXarxa todavía no puede entrar así." }, 401)
    : e.motivo === "rechazada" ? json({ error: `iSquad no acepta ese usuario y contraseña${/te queda/i.test(e.aviso) ? ". " + e.aviso.replace(/^.*?(te queda)/i, "Te queda") : ""}` }, 401)
    : null;
  const devolver = async () => { await db0.from("pub_cache").delete().eq("key", topes[0].k); await sumar(db0, topes[1], -1).catch(() => 0); };
  // Lo que no es un fallo de contraseña (iSquad caído, petición incompleta) tampoco cuenta.
  const noCuenta = async (r: Response) => { await sumar(db0, topes[0], -1).catch(() => 0); await sumar(db0, topes[1], -1).catch(() => 0); return r; };

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
      await devolver();
      return json({
        guest: true, nombre,
        matches: list.map(({ staff, ...m }) => ({ ...m, ...(staff ?? {}), staff_checked: staff ? now : null, last_seen: now })),
      });
    } catch (e) {
      if (e instanceof IsquadAuthError) return porQue(e) ?? malas();
      return await noCuenta(json({ error: "No se ha podido conectar con iSquad. Prueba en unos minutos." }, 502));
    }
  }

  let matches: ScrapedMatch[];
  try { matches = await fetchDesignaciones(login, password); }
  catch (e) {
    if (!(e instanceof IsquadAuthError)) { await diag("conexion: " + (e as Error).message); return await noCuenta(json({ error: "No se ha podido conectar con iSquad. Prueba en unos minutos." }, 502)); }
    await diag(e.motivo + (e.sesion ? " (con sesión)" : ""));
    // iSquad ha dicho que no (contraseña, bloqueo, 2 pasos): ahí se acaba. Si ha entrado pero no es árbitro, con la misma
    // sesión se mira si es jugador o entrenador (login único: un solo intento en iSquad).
    const no = porQue(e); if (no) return no;
    if (!e.sesion) return malas();
    // No es árbitro (o no entra en esa área): ¿jugador o entrenador? Misma cuenta de iSquad.
    let dep;
    try { dep = await loginDeportista(e.sesion); }
    catch (e2) {
      if (e2 instanceof IsquadAuthError) { await diag("deportista: " + e2.motivo); return porQue(e2) ?? malas(); }
      return await noCuenta(json({ error: "No se ha podido conectar con iSquad. Prueba en unos minutos." }, 502));
    }
    await devolver();
    // Un árbitro que ya tiene cuenta NO pasa a jugador porque su área de árbitro falle (iSquad en mantenimiento, con otro
    // diseño o cambiando de formulario de login, como el 20/21-oct): perdería Cobros, su población y la contraseña
    // guardada. La contraseña es buena (ha entrado como jugador): es iSquad. Revisión del 2-nov-2026: antes solo se
    // protegía el caso "ilegible" y no el de "login".
    const { data: prev } = await db0.from("profiles").select("tipo").eq("login_key", key).maybeSingle();
    if (prev && prev.tipo !== "deportista") return json({ error: "No se ha podido leer iSquad. Prueba en unos minutos." }, 502);
    return await entrarDeportista(key, login, dep, body);
  }
  await devolver();

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

  const origin = existing?.origin || (body.origin || "").trim();   // quien antes entró como jugador no tiene población: se pone en Ajustes
  const { error: pe } = await db.from("profiles").upsert(
    // tipo: quien entra como árbitro lo es, aunque antes hubiera entrado como jugador (licencia nueva o un fallo de iSquad).
    { user_id: userId, login_key: key, isquad_login: login, origin, tipo: "arbitro", last_error: null, ...(existing ? {} : consentNew()) }, { onConflict: "user_id" });
  if (pe) return json({ error: "No se ha podido guardar el perfil" }, 500);
  await db.from("isquad_credentials").upsert({ user_id: userId, secret: await encrypt(password), session: null, session_at: null, updated_at: new Date().toISOString() });
  // Los partidos se guardan ya; el equipo arbitral de cada designación y los km se leen después, sin hacer esperar.
  try { await storeMatches(db, userId, matches); background(syncUser(db, userId, { km: "wait", deadline: started + 130_000 })); }
  catch (_) { /* la sincronización programada lo reintentará */ }

  return json({ token_hash: link.properties.hashed_token });
});
