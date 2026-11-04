// Altas de árbitros hechas por un administrador (4-nov-2026). Desde ese día iSquad responde 403 a nuestro servidor en el
// área privada y nadie puede entrar con su usuario y contraseña. El administrador elige al árbitro de la lista pública
// de la FCVB (comprobado: tiene que salir allí), pone el email con el que entra en iSquad (así, si iSquad vuelve a dejar
// entrar, ese mismo login cae en la misma cuenta) y su población. Se crea la cuenta SIN contraseña de iSquad: sus
// designaciones salen de la ficha pública (syncPublico). Devuelve un enlace de acceso de un solo uso (1 hora, el
// mailer_otp_exp del proyecto) para que se lo pase; al abrirlo, el árbitro acepta las condiciones y queda dentro.
// Si ya tiene cuenta, solo se da un enlace nuevo.
import { arbitrosPublicos, type Db } from "./publico.ts";
import { background, syncPublico } from "./sync.ts";
import { POLICY_VERSION } from "./politica.ts";

const SITE = "https://fsarmesto.github.io/enxarxa/";
const titulo = (s: string) => s.toLowerCase().replace(/(^|[\s'·-])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());

export async function arbitrosParaAlta(db: Db) {
  const lista = await arbitrosPublicos(db);
  const { data } = await db.from("profiles").select("id_arbitro").not("id_arbitro", "is", null);
  const con = new Set((data || []).map((p: { id_arbitro: string }) => p.id_arbitro));
  return lista.map((a) => ({ id: a.id, nombre: titulo(a.name), cuenta: con.has(a.id) })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export async function altaArbitro(db: Db, b: { id_arbitro?: string; email?: string; origin?: string }) {
  const id = String(b.id_arbitro || "").trim(), email = String(b.email || "").trim().toLowerCase(), origin = String(b.origin || "").trim().slice(0, 80);
  if (!/^\d+$/.test(id)) return { ok: false, error: "Elige al árbitro de la lista." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Pon el email con el que entra en iSquad." };
  const a = (await arbitrosPublicos(db)).find((x) => x.id === id);
  if (!a) return { ok: false, error: "No sale en la lista pública de árbitros de la FCVB." };
  const { data: porEmail } = await db.from("profiles").select("user_id, id_arbitro, tipo").eq("login_key", email).maybeSingle();
  const { data: porId } = await db.from("profiles").select("user_id, login_key").eq("id_arbitro", id).maybeSingle();
  if (porEmail?.id_arbitro && porEmail.id_arbitro !== id) return { ok: false, error: "Ese email ya es de la cuenta de otro árbitro." };
  if (porId && porId.login_key !== email) return { ok: false, error: "Ese árbitro ya tiene cuenta con otro email." };
  const ya = porEmail || porId;
  if (!ya && !origin) return { ok: false, error: "Pon la población desde la que sale a arbitrar." };
  if (!ya) {
    const { error } = await db.auth.admin.createUser({ email, email_confirm: true });
    if (error && !/already|registered|exists/i.test(error.message)) return { ok: false, error: "No se ha podido crear la cuenta." };
  }
  const { data: link, error: le } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (le || !link?.user) return { ok: false, error: "No se ha podido crear el enlace." };
  const userId = link.user.id, nombre = titulo(a.name);
  if (!ya) {
    // Sin consent_at: lo acepta él al abrir el enlace (auth-isquad, action "aceptar").
    const { error } = await db.from("profiles").upsert({ user_id: userId, login_key: email, isquad_login: email, origin, nombre, id_arbitro: id, tipo: "arbitro" }, { onConflict: "user_id" });
    if (error) return { ok: false, error: "No se ha podido guardar el perfil." };
    background(syncPublico(db, userId, { deadline: Date.now() + 60_000 }));
  } else if (porEmail && !porEmail.id_arbitro) {
    await db.from("profiles").update({ id_arbitro: id }).eq("user_id", porEmail.user_id);
  }
  return { ok: true, nuevo: !ya, nombre, enlace: `${SITE}?acceso=${encodeURIComponent(link.properties.hashed_token)}` };
}

// Al abrir el enlace: acepta las condiciones (y la edad) y se apunta, como en el alta normal.
export async function aceptarAlta(db: Db, userId: string, b: { consent?: boolean; age14?: boolean }) {
  if (!b.consent || !b.age14) return { ok: false, error: "Marca las 2 casillas para continuar." };
  await db.from("profiles").update({ consent_at: new Date().toISOString(), policy_version: POLICY_VERSION }).eq("user_id", userId).is("consent_at", null);
  return { ok: true };
}
