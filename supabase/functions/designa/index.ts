// Designaciones del fin de semana (3-nov-2026, para Albert, designador de la FCVB).
// - Formulario de disponibilidad (docs/disponibilidad/): con cuenta de la app, nombre y población salen del perfil (la
//   población es la de iSquad); sin cuenta, se escriben a mano y se devuelve un código para cambiarla o retirarla.
// - Panel del designador (docs/designa-admin/): login propio (secret DESIGNA_USERS = "usuario:sal:pbkdf2hex", separados
//   por comas; nada en el repo, que es público), partidos del fin de semana de la web pública de la federación, las
//   disponibilidades y el plan (designa_asig). Solo un plan: nada se escribe en iSquad.
// Las distancias son en línea recta entre la población del árbitro y el pabellón (Photon, caché geo_cache), sin gastar
// rutas de OpenRouteService; la web las enseña como aproximadas.
import { admin, cors, geocode, json, locate, userFromRequest } from "../_shared/sync.ts";
import { feed, norm, type Partido } from "../_shared/publico.ts";
import { todas } from "../_shared/db.ts";
import { adminLogins } from "../_shared/admin.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const DIAS = ["no", "manana", "tarde", "ambas"];

// ---------- Fin de semana ----------
const hoyMadrid = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
const masDias = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
// El sábado del fin de semana que toca: de lunes a sábado, el de esta semana; el domingo, el siguiente (ya se designa
// el próximo). siguiente = el de después (el designador puede ir adelantando).
function findes() {
  const hoy = hoyMadrid(), wd = new Date(hoy + "T12:00:00Z").getUTCDay();   // 0 = domingo
  const sab = wd === 0 ? masDias(hoy, 6) : masDias(hoy, 6 - wd);
  return [sab, masDias(sab, 7)];
}
const validFinde = (f: unknown) => typeof f === "string" && findes().includes(f) ? f : findes()[0];

// ---------- Login del designador ----------
const SECRET = () => Deno.env.get("DESIGNA_SECRET") || "";
async function hmac(s: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(SECRET()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(s)));
}
async function pbkdf2(pass: string, salt: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100_000 }, k, 256));
}
// Comparación en tiempo constante (que no se pueda adivinar la clave por lo que tarda).
const igual = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
async function claveOk(usuario: string, clave: string) {
  for (const e of (Deno.env.get("DESIGNA_USERS") || "").split(",")) {
    const [u, salt, h] = e.trim().split(":");
    if (u && salt && h && u.toLowerCase() === usuario.toLowerCase()) return igual(await pbkdf2(clave, salt), h);
  }
  await pbkdf2(clave, "nadie");   // mismo tiempo exista o no el usuario
  return false;
}
const SESION_MS = 12 * 3600_000;
async function token(usuario: string) { const p = btoa(JSON.stringify({ u: usuario, exp: Date.now() + SESION_MS })); return `${p}.${await hmac(p)}`; }
async function designador(req: Request): Promise<string | null> {
  const t = req.headers.get("x-designa-token") || "";
  const [p, s] = t.split(".");
  if (!p || !s || !SECRET() || !igual(await hmac(p), s)) return null;
  try { const x = JSON.parse(atob(p)); return x.exp > Date.now() ? x.u : null; } catch { return null; }
}
// Tope de intentos, como auth-isquad (sumar_intento, migración 034).
async function sumar(db: Db, k: string, ms: number, delta: number) {
  const { data, error } = await db.rpc("sumar_intento", { k, ventana_ms: ms, delta });
  return error ? 0 : +(data ?? 0);
}
const ipDe = (req: Request) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";

// ---------- Población → coordenadas ----------
async function ubicarPoblacion(db: Db, pob: string): Promise<[number, number] | null | "error"> {
  const p = await geocode(db, pob, true);
  if (p === "error") return "error";
  return p ? p.at : null;
}

// ---------- Disponibilidad ----------
type DispIn = { nombre?: string; poblacion?: string; coche?: boolean; sab?: string; sab_obs?: string; dom?: string; dom_obs?: string };
const limpio = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
function validar(b: DispIn): { ok: true; v: Record<string, unknown> } | { ok: false; error: string } {
  const nombre = limpio(b.nombre, 80), poblacion = limpio(b.poblacion, 80);
  if (nombre.length < 3) return { ok: false, error: "Escribe tu nombre y apellidos." };
  if (poblacion.length < 2) return { ok: false, error: "Escribe tu población." };
  if (typeof b.coche !== "boolean") return { ok: false, error: "Indica si tienes coche." };
  const sab = String(b.sab || ""), dom = String(b.dom || "");
  if (!DIAS.includes(sab) || !DIAS.includes(dom)) return { ok: false, error: "Indica tu disponibilidad del sábado y del domingo." };
  return { ok: true, v: { nombre, poblacion, coche: b.coche, sab, dom, sab_obs: limpio(b.sab_obs, 300), dom_obs: limpio(b.dom_obs, 300) } };
}
const publica = (d: Record<string, unknown> | null) => d && ({ nombre: d.nombre, poblacion: d.poblacion, coche: d.coche, sab: d.sab, sab_obs: d.sab_obs, dom: d.dom, dom_obs: d.dom_obs, updated_at: d.updated_at });

// Las respuestas de fines de semana pasados se borran a las 4 semanas (y con ellas, el plan).
const limpiar = (db: Db) => Promise.all([db.from("designa_disp").delete().lt("finde", masDias(hoyMadrid(), -28)),
  db.from("designa_hecho").delete().lt("finde", masDias(hoyMadrid(), -28))]);

async function perfil(db: Db, req: Request) {
  const user = await userFromRequest(db, req);
  if (!user) return null;
  const { data } = await db.from("profiles").select("user_id, login_key, nombre, origin, origin_lon, origin_lat, tipo").eq("user_id", user.id).maybeSingle();
  return data;
}
const titulo = (s: string) => (s || "").toLowerCase().replace(/(^|[\s'·-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

// Quién puede dar disponibilidad (3-nov-2026, Ferran: de momento solo él, para probarlo). Secret DISPO_LOGINS:
// sin poner = solo los de ADMIN_LOGINS; "todos" = cualquiera, también sin cuenta; si no, logins de iSquad separados por
// comas. Se cambia con `supabase secrets set DISPO_LOGINS=todos`, sin desplegar.
// deno-lint-ignore no-explicit-any
function puedeDar(p: any): boolean {
  const v = (Deno.env.get("DISPO_LOGINS") || "").trim().toLowerCase();
  if (v === "todos") return true;
  const lista = v ? v.split(",").map((x) => x.trim()).filter(Boolean) : adminLogins();
  return !!p?.login_key && lista.includes(String(p.login_key).toLowerCase());
}
const CERRADO = "De momento el formulario está en pruebas y solo lo pueden usar algunas cuentas.";

async function form(db: Db, req: Request, b: { finde?: string; codigo?: string }) {
  const finde = validFinde(b.finde), p = await perfil(db, req);
  if (!puedeDar(p)) return { ok: true, finde, findes: findes(), cerrado: true, conCuenta: !!p, cuenta: null, mia: null };
  let mia = null;
  if (p) mia = (await db.from("designa_disp").select("*").eq("finde", finde).eq("user_id", p.user_id).maybeSingle()).data;
  else if (b.codigo) mia = (await db.from("designa_disp").select("*").eq("finde", finde).eq("edit_hash", await sha(String(b.codigo))).maybeSingle()).data;
  return { ok: true, finde, findes: findes(), cuenta: p ? { nombre: titulo(p.nombre || ""), poblacion: p.origin || "", tipo: p.tipo } : null, mia: publica(mia) };
}

async function enviar(db: Db, req: Request, b: DispIn & { finde?: string; codigo?: string }) {
  const finde = validFinde(b.finde), p = await perfil(db, req);
  if (!puedeDar(p)) return json({ error: CERRADO }, 403);
  const val = validar(b); if (!val.ok) return json({ error: val.error }, 400);
  // Sin cuenta: como mucho 20 envíos por conexión y hora (que no se pueda llenar la lista de basura).
  if (!p) {
    const k = `disp:${(await sha("ip:" + ipDe(req))).slice(0, 24)}`;
    if (await sumar(db, k, 3600_000, 1) > 20) return json({ error: "Demasiados envíos. Prueba de nuevo dentro de un rato." }, 429);
  }
  const at = await ubicarPoblacion(db, val.v.poblacion as string);
  if (at === "error") return json({ error: "No se ha podido comprobar la población. Inténtalo de nuevo en un momento." }, 503);
  if (!at) return json({ error: "No encuentro esa población en Catalunya. Revisa cómo está escrita." }, 400);
  const row = { ...val.v, finde, lon: at[0], lat: at[1], updated_at: new Date().toISOString() };
  if (p) {
    const { data: prev } = await db.from("designa_disp").select("id").eq("finde", finde).eq("user_id", p.user_id).maybeSingle();
    const { error } = prev ? await db.from("designa_disp").update(row).eq("id", prev.id) : await db.from("designa_disp").insert({ ...row, user_id: p.user_id });
    if (error) return json({ error: "No se ha podido guardar. Inténtalo de nuevo." }, 500);
    return json({ ok: true, finde });
  }
  if (b.codigo) {
    const { data: prev } = await db.from("designa_disp").select("id").eq("finde", finde).eq("edit_hash", await sha(String(b.codigo))).maybeSingle();
    if (prev) {
      const { error } = await db.from("designa_disp").update(row).eq("id", prev.id);
      if (error) return json({ error: "No se ha podido guardar. Inténtalo de nuevo." }, 500);
      return json({ ok: true, finde, codigo: b.codigo });
    }
  }
  const codigo = hex(crypto.getRandomValues(new Uint8Array(16)));
  const { error } = await db.from("designa_disp").insert({ ...row, edit_hash: await sha(codigo) });
  if (error) return json({ error: "No se ha podido guardar. Inténtalo de nuevo." }, 500);
  return json({ ok: true, finde, codigo });
}

async function retirar(db: Db, req: Request, b: { finde?: string; codigo?: string }) {
  const finde = validFinde(b.finde), p = await perfil(db, req);
  if (!puedeDar(p)) return json({ error: CERRADO }, 403);
  let q = db.from("designa_disp").delete().eq("finde", finde);
  if (p) q = q.eq("user_id", p.user_id);
  else if (b.codigo) q = q.eq("edit_hash", await sha(String(b.codigo)));
  else return json({ error: "No hay ninguna respuesta tuya que retirar." }, 400);
  await q;
  return json({ ok: true });
}

// ---------- Panel del designador ----------
const matchKey = (p: Partido) => `${p.d}|${norm(p.l)}|${norm(p.v)}`;
const relevante = (cat: string) => !/ALEVI|AMATEUR|MASTER|VETERA|BENJAMI/.test(norm(cat));
// Coordenadas de los pabellones del fin de semana, guardadas en pub_cache (designa-geo2:<sábado>) para no volver a
// buscarlas. El listado de la federación no trae la calle (solo "PABELLÓN - PISTA 2"): la dirección sale de las
// designaciones de los árbitros de la app (matches.addr, la de iSquad), por el nombre sin la pista. Photon va a 1
// consulta por segundo: si hay muchos nuevos, se ubican por tandas (hasta la hora límite) y la web vuelve a pedir el panel.
const sinPista = (s: string) => norm(s).replace(/\s*-\s*(PISTA|TERCIO|TERC|CAMP|SALA|ANNEX|PISTA\s*\d).*$/, "").replace(/\s*-\s*$/, "").trim();
async function direcciones(db: Db): Promise<Map<string, { addr: string; venue: string }>> {
  const rows = await todas<{ venue: string | null; addr: string | null }>(() => db.from("matches").select("venue, addr").not("addr", "is", null).order("user_id").order("id"));
  const m = new Map<string, { addr: string; venue: string }>();
  for (const r of rows) if (r.venue && r.addr && /\d{5}/.test(r.addr)) m.set(sinPista(r.venue), { addr: r.addr, venue: r.venue });
  return m;
}
async function pabellones(db: Db, finde: string, ps: Partido[], hasta: number) {
  const key = `designa-geo2:${finde}`;
  const { data } = await db.from("pub_cache").select("data").eq("key", key).maybeSingle();
  const geo: Record<string, [number, number] | null> = data?.data || {};
  const kOf = (p: Partido) => sinPista(p.pab);
  let nuevos = 0, dirs: Map<string, { addr: string; venue: string }> | null = null;
  for (const p of ps) {
    const k = kOf(p);
    if (k in geo) continue;
    if (Date.now() > hasta) break;
    dirs ??= await direcciones(db);
    const d = dirs.get(k);
    const r = d ? await locate(db, d.addr, d.venue) : (/\d{5}/.test(p.pista) ? await locate(db, p.pista, p.pab) : null);
    if (r === "error") break;
    geo[k] = r ? r.at : null; nuevos++;
  }
  if (nuevos) await db.from("pub_cache").upsert({ key, data: geo, fetched_at: new Date().toISOString() });
  const falta = ps.filter((p) => !(kOf(p) in geo)).length;
  return { geo, falta, kOf };
}

async function panel(db: Db, b: { finde?: string }, t0: number) {
  const finde = validFinde(b.finde), dom = masDias(finde, 1);
  limpiar(db).then(() => {}, () => {});
  const ps = (await feed(db)).filter((p) => p.d.slice(0, 10) === finde || p.d.slice(0, 10) === dom).sort((a, b) => a.d.localeCompare(b.d) || a.pab.localeCompare(b.pab));
  const { geo, falta, kOf } = await pabellones(db, finde, ps, t0 + 40_000);
  // Si iSquad ya tiene árbitro: cálculo semanal del panel de Administración (desig-global, solo la semana en curso).
  const { data: g } = await db.from("pub_cache").select("data").eq("key", "desig-global").maybeSingle();
  const r = g?.data as { desde?: string; hasta?: string; pendientes?: { d: string; l: string; v: string }[] } | undefined;
  const cubre = !!(r?.pendientes && r.desde && r.hasta && r.desde <= finde && r.hasta >= dom);
  const sinArb = new Set((cubre ? r!.pendientes! : []).map((x) => `${x.d}|${norm(x.l)}|${norm(x.v)}`));
  const { data: disp } = await db.from("designa_disp").select("*").eq("finde", finde).order("nombre");
  const isq = await designacionesIsquad(db, finde, (disp || []).map((d: { user_id: string | null }) => d.user_id).filter(Boolean));
  const { data: asig } = await db.from("designa_asig").select("match_key, rol, disp_id").eq("finde", finde);
  const { data: hecho } = await db.from("designa_hecho").select("match_key").eq("finde", finde);
  return {
    ok: true, finde, findes: findes(), falta, estadoIsquad: cubre,
    partidos: ps.map((p) => {
      const k = matchKey(p), at = geo[kOf(p)];
      return { key: k, d: p.d, conf: p.c, l: p.l, v: p.v, cat: p.cat, comp: p.comp, pab: p.pab, pista: p.pista, lon: at?.[0] ?? null, lat: at?.[1] ?? null,
        liga: relevante(p.cat), isquad: cubre && relevante(p.cat) ? (sinArb.has(k) ? "sin" : "con") : null };
    }),
    disp: (disp || []).map((d: Record<string, unknown>) => ({ id: d.id, nombre: d.nombre, poblacion: d.poblacion, lon: d.lon, lat: d.lat, coche: d.coche,
      sab: d.sab, sab_obs: d.sab_obs, dom: d.dom, dom_obs: d.dom_obs, app: !!d.user_id, origen: d.origen, updated_at: d.updated_at,
      // Lo que ya tiene designado en iSquad ese fin de semana (hora y pabellón; solo árbitros con cuenta): para los choques.
      isq: d.user_id ? (isq.get(d.user_id as string) || []).map((o) => ({ d: o.d, pab: o.pab })) : [] })),
    asig: asig || [],
    hecho: (hecho || []).map((h: { match_key: string }) => h.match_key),
  };
}

// ---------- Choques (4-nov-2026, Ferran: nadie puede estar en 2 partidos a la vez) ----------
// Dos partidos del mismo día se pisan si sus inicios están a menos de 1 h en el mismo pabellón, o de 1 h 45 min en otro.
// No es un bloqueo (Ferran, 4-nov): el panel avisa con una ventana y, si el designador lo confirma, manda forzar=true;
// sin confirmar, el servidor responde 409. El mismo árbitro en 2 puestos del mismo partido sí se rechaza siempre.
// En pabellones distintos con poco margen para el viaje, el panel solo lo indica. Cuenta el plan del panel y, de los árbitros con cuenta, sus designaciones de
// iSquad (tabla matches). La misma regla está en docs/designa-admin/index.html (choque).
const PISA_MIN = 105, PISA_MISMO_MIN = 60;
const minDe = (d: string) => +d.slice(11, 13) * 60 + +d.slice(14, 16);
// El mismo partido visto desde iSquad (designación del árbitro) y desde la web pública: misma hora y mismo pabellón.
const mismoPab = (a: string, b: string) => { const x = sinPista(a), y = sinPista(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
type Ocupa = { d: string; pab: string; isq?: boolean };
async function designacionesIsquad(db: Db, finde: string, users: string[]): Promise<Map<string, Ocupa[]>> {
  const m = new Map<string, Ocupa[]>();
  if (!users.length) return m;
  const { data } = await db.from("matches").select("user_id, date, time, venue").in("user_id", users).in("date", [finde, masDias(finde, 1)]).is("missing_since", null);
  for (const r of data || []) if (r.time) (m.get(r.user_id) ?? m.set(r.user_id, []).get(r.user_id)!).push({ d: `${r.date} ${r.time}`, pab: r.venue || "" });
  return m;
}
const horaPab = (o: Ocupa) => { const p = o.pab.replace(/\s*-\s*(PISTA|TERCIO|TERC|CAMP|SALA|ANNEX).*$/i, "").trim(); return `${o.d.slice(11, 16)}${p ? " (" + titulo(p) + ")" : ""}`; };

// El listado de partidos, guardado 1 minuto en memoria: un lote de 100 asignaciones no lo vuelve a leer 100 veces.
let feedMem: { t: number; ps: Partido[] } | null = null;
async function feedReciente(db: Db) {
  if (!feedMem || Date.now() - feedMem.t > 60_000) feedMem = { t: Date.now(), ps: await feed(db) };
  return feedMem.ps;
}
// Texto del choque (o null): el mismo árbitro en otro puesto de este partido, u otro partido que se pisa con este.
// deno-lint-ignore no-explicit-any
async function choqueDe(db: Db, finde: string, d: any, key: string, rol: string, forzar = false): Promise<string | null> {
  const nombre = titulo(d.nombre || "");
  const { data: suyas } = await db.from("designa_asig").select("match_key, rol").eq("finde", finde).eq("disp_id", d.id);
  const otras = (suyas || []).filter((x: { match_key: string; rol: string }) => !(x.match_key === key && x.rol === rol));
  const aqui = otras.find((x: { match_key: string }) => x.match_key === key);
  if (aqui) return `${nombre} ya está en este partido como ${aqui.rol === "an" ? "anotador" : aqui.rol.toUpperCase()}.`;
  if (forzar) return null;
  const dia = key.slice(0, 10), t = minDe(key);
  const ps = await feedReciente(db), porKey = new Map(ps.map((p) => [matchKey(p), p]));
  const este = porKey.get(key);
  const ocupa: Ocupa[] = otras.map((x: { match_key: string }) => ({ d: x.match_key.slice(0, 16), pab: porKey.get(x.match_key)?.pab || "" }));
  if (d.user_id) for (const o of (await designacionesIsquad(db, finde, [d.user_id])).get(d.user_id) || []) {
    if (o.d === key.slice(0, 16) && este && mismoPab(o.pab, este.pab)) continue;   // es este mismo partido
    ocupa.push({ ...o, isq: true });
  }
  const x = ocupa.find((o) => o.d.slice(0, 10) === dia && Math.abs(minDe(o.d) - t) < (este && mismoPab(o.pab, este.pab) ? PISA_MISMO_MIN : PISA_MIN));
  if (!x) return null;
  return `${nombre} ya tiene ${x.isq ? "en iSquad " : ""}el partido de las ${horaPab(x)}: confírmalo en el panel si quieres ponerlo igualmente.`;
}

async function asignar(db: Db, b: { finde?: string; key?: string; rol?: string; disp_id?: string | null; forzar?: boolean }) {
  const finde = validFinde(b.finde), rol = String(b.rol || ""), key = String(b.key || "");
  if (!["r1", "r2", "an"].includes(rol) || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}\|/.test(key)) return json({ error: "Petición no válida" }, 400);
  if (key.slice(0, 10) !== finde && key.slice(0, 10) !== masDias(finde, 1)) return json({ error: "Ese partido no es de este fin de semana" }, 400);
  if (!b.disp_id) { await db.from("designa_asig").delete().eq("match_key", key).eq("rol", rol); return json({ ok: true }); }
  const { data: d } = await db.from("designa_disp").select("id, nombre, user_id").eq("id", b.disp_id).eq("finde", finde).maybeSingle();
  if (!d) return json({ error: "Ese árbitro no ha dado disponibilidad este fin de semana" }, 400);
  const choque = await choqueDe(db, finde, d, key, rol, b.forzar === true);
  if (choque) return json({ error: choque }, 409);
  const { error } = await db.from("designa_asig").upsert({ finde, match_key: key, rol, disp_id: d.id });
  return error ? json({ error: "No se ha podido guardar" }, 500) : json({ ok: true });
}

// Varias asignaciones de una vez (propuesta automática, "toda la franja a…"): una a una, con las mismas comprobaciones
// que asignar; forzar = el designador ya ha confirmado los avisos de choque. Devuelve las que no se han podido guardar.
async function lote(db: Db, b: { finde?: string; items?: unknown; forzar?: boolean }) {
  const items = Array.isArray(b.items) ? b.items.slice(0, 300) : [];
  if (!items.length) return json({ error: "Petición no válida" }, 400);
  let hechos = 0; const fallos: { key: string; rol: string; error: string }[] = [];
  for (const it of items as { key?: string; rol?: string; disp_id?: string }[]) {
    const r = await asignar(db, { finde: b.finde, key: it.key, rol: it.rol, disp_id: it.disp_id, forzar: b.forzar === true });
    if (r.ok) hechos++; else fallos.push({ key: String(it.key || ""), rol: String(it.rol || ""), error: (await r.json()).error || "Error" });
  }
  return json({ ok: true, hechos, fallos });
}

// Casilla "Pasado a iSquad" de un partido del fin de semana.
async function marcarHecho(db: Db, b: { finde?: string; key?: string; si?: boolean }) {
  const finde = validFinde(b.finde), key = String(b.key || "");
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}\|/.test(key) || (key.slice(0, 10) !== finde && key.slice(0, 10) !== masDias(finde, 1))) return json({ error: "Petición no válida" }, 400);
  const { error } = b.si ? await db.from("designa_hecho").upsert({ finde, match_key: key }) : await db.from("designa_hecho").delete().eq("match_key", key);
  return error ? json({ error: "No se ha podido guardar" }, 500) : json({ ok: true });
}

// El designador añade a mano a quien le ha dicho su disponibilidad por otra vía (teléfono, WhatsApp), o la corrige.
async function altaManual(db: Db, b: DispIn & { finde?: string; id?: string }) {
  const finde = validFinde(b.finde), val = validar(b); if (!val.ok) return json({ error: val.error }, 400);
  const at = await ubicarPoblacion(db, val.v.poblacion as string);
  if (at === "error") return json({ error: "No se ha podido comprobar la población. Inténtalo de nuevo." }, 503);
  if (!at) return json({ error: "No encuentro esa población en Catalunya." }, 400);
  const row = { ...val.v, finde, lon: at[0], lat: at[1], updated_at: new Date().toISOString() };
  const { error } = b.id ? await db.from("designa_disp").update(row).eq("id", b.id).eq("finde", finde) : await db.from("designa_disp").insert({ ...row, origen: "designador" });
  return error ? json({ error: "No se ha podido guardar" }, 500) : json({ ok: true });
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  // El panel manda su sesión en x-designa-token: el navegador la pregunta antes (CORS) y tiene que estar permitida.
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...cors, "Access-Control-Allow-Headers": cors["Access-Control-Allow-Headers"] + ", x-designa-token" } });
  const db = admin();
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: "Petición no válida" }, 400); }
  const a = String(b.action || "");
  try {
    // Árbitros (con cuenta o sin ella).
    if (a === "form") return json(await form(db, req, b));
    if (a === "enviar") return await enviar(db, req, b as DispIn);
    if (a === "retirar") return await retirar(db, req, b);
    // Designador.
    if (a === "login") {
      const usuario = limpio(b.usuario, 60), clave = String(b.clave || "");
      if (!usuario || !clave) return json({ error: "Escribe el usuario y la contraseña." }, 400);
      const ku = `designa-login:${(await sha("u:" + usuario.toLowerCase())).slice(0, 24)}`, ki = `designa-login:${(await sha("ip:" + ipDe(req))).slice(0, 24)}`;
      const [nu, ni] = await Promise.all([sumar(db, ku, 15 * 60_000, 1), sumar(db, ki, 3600_000, 1)]);
      if (nu > 5 || ni > 20) return json({ error: "Demasiados intentos. Prueba de nuevo dentro de un rato." }, 429);
      if (!SECRET() || !(await claveOk(usuario, clave))) return json({ error: "Usuario o contraseña incorrectos." }, 401);
      await Promise.all([db.from("pub_cache").delete().eq("key", ku), sumar(db, ki, 3600_000, -1)]);
      return json({ ok: true, token: await token(usuario), usuario, exp: Date.now() + SESION_MS });
    }
    const u = await designador(req);
    if (!u) return json({ error: "Sesión caducada. Vuelve a entrar." }, 401);
    if (a === "panel") return json(await panel(db, b, t0));
    if (a === "asignar") return await asignar(db, b);
    if (a === "lote") return await lote(db, b);
    if (a === "hecho") return await marcarHecho(db, b);
    if (a === "alta") return await altaManual(db, b as DispIn);
    if (a === "quitar") { await db.from("designa_disp").delete().eq("id", String(b.id || "")).eq("finde", validFinde(b.finde)); return json({ ok: true }); }
    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    console.error("designa", a, (e as Error).message);
    return json({ error: "Ha fallado algo. Inténtalo de nuevo." }, 500);
  }
});

