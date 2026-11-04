// Prueba de los choques del designador (choqueDe en supabase/functions/designa) con una base de datos simulada.
// Lanzar desde la raíz del repo (necesita las variables VAPID_* de verdad, porque _shared/push.ts las valida al cargar):
//   VAPID_SUBJECT=mailto:x@example.com VAPID_PUBLIC=... VAPID_PRIVATE=... SUPABASE_URL=http://x SUPABASE_SERVICE_ROLE_KEY=x \
//   deno run --no-check -A tools/prueba-designa-choques.ts
// Copia la función sin Deno.serve junto a index.ts (para que resuelvan los imports de _shared) y la borra al acabar.
const DIR = new URL("../supabase/functions/designa/", import.meta.url);
const MOD = new URL("_prueba_mod.ts", DIR);
await Deno.writeTextFile(MOD, (await Deno.readTextFile(new URL("index.ts", DIR))).split("Deno.serve(")[0] + "\nexport { choqueDe, lote, importar, porNombre, ubicar, equiposDe };\n");
// deno-lint-ignore no-explicit-any
let choqueDe: any, lote: any, importar: any, porNombre: any, ubicar: any, equiposDe: any;
try { ({ choqueDe, lote, importar, porNombre, ubicar, equiposDe } = await import(MOD.href)); } finally { await Deno.remove(MOD); }
const SAB = "2026-11-07", DOM = "2026-11-08";
const P = (h: string, l: string, v: string, pab: string, d = SAB) => ({ d: `${d} ${h}`, c: true, l, v, cl: "", cv: "", comp: "", cat: "SENIOR", pab, pista: "" });
const feedRows = [P("08:00", "CV MANRESA", "CV A", "PAVELLÓ CONGOST - PISTA 1"), P("08:00", "CV SANT QUIRZE", "CV B", "PAVELLÓ SANT QUIRZE"),
  P("10:00", "CV MANRESA", "CV C", "PAVELLÓ CONGOST - PISTA 1"), P("09:30", "CV VIC", "CV D", "PAVELLÓ OLÍMPIC"), P("16:00", "IGUALADA VC", "CV E", "PAVELLÓ LES COMES"),
  P("08:30", "CV MANRESA B", "CV F", "PAVELLÓ CONGOST - PISTA 2"), P("09:00", "CV MANRESA C", "CV G", "PAVELLO CONGOST - PISTA 3")];
const key = (p: ReturnType<typeof P>) => `${p.d}|${p.l}|${p.v}`;
let asig: { match_key: string; rol: string }[] = [], matches: { user_id: string; date: string; time: string; venue: string }[] = [];
// deno-lint-ignore no-explicit-any
const guardadas: { match_key: string; rol: string }[] = [];
// geo_cache simulada (sin ir a Photon): "VILLARRIBA" no existe; el resto, en Igualada.
let sinCache = false;   // true = geo_cache vacía: se va a Photon (simulado más abajo)
const geo = (query: string) => sinCache ? null : /VILLARRIBA/.test(query) ? { found: false, created_at: new Date().toISOString() } : { found: true, lon: 1.62, lat: 41.58, exact: false, created_at: new Date().toISOString() };
let dispYa: { id: string; nombre: string; user_id: string | null }[] = [];
const insertadas: Record<string, unknown>[] = [], actualizadas: Record<string, unknown>[] = [];
let filtro = "";
const db = { from(t: string) { const q: any = { select: () => q, eq: (_k: string, v: string) => { filtro = String(v); return q; }, in: () => q, is: () => q, order: () => q, single: async () => ({ data: { id: "nuevo" }, error: null }),
  insert: (row: Record<string, unknown>) => { insertadas.push(row); return q; }, update: (row: Record<string, unknown>) => { actualizadas.push(row); return { eq: async () => ({ error: null }) }; },
  upsert: async (row: { match_key: string; rol: string }) => { if (t === "designa_asig") { guardadas.push(row); asig.push({ match_key: row.match_key, rol: row.rol }); } return { error: null }; },
  maybeSingle: async () => ({ data: t === "pub_cache" ? { data: feedRows, fetched_at: new Date().toISOString() } : t === "designa_disp" ? d : t === "geo_cache" ? geo(filtro) : null }),
  // deno-lint-ignore no-explicit-any
  delete: () => { borrados.push(t); return q; },
  then: (ok: any) => ok({ data: t === "designa_asig" ? asig : t === "matches" ? matches : t === "designa_disp" ? dispYa : t === "fav_teams" ? favs : [], error: null }) };
  if (t === "designa_pab" || t === "geo_cache") q.upsert = async (row: Record<string, unknown>) => { if (t === "designa_pab") pabs.push(row); return { error: null }; };
  return q; } };
const borrados: string[] = [], pabs: Record<string, unknown>[] = [];
let favs: Record<string, unknown>[] = [];
const d = { id: "x", nombre: "FERRAN SANCHIS", user_id: "u1" };
let fallos = 0; const check = (c: boolean, t: string) => { console.log((c ? "OK   " : "FALLA") + " " + t); if (!c) fallos++; };
const [M8, SQ8, M10, V930, I16, M830, M9] = feedRows.map(key);
asig = [{ match_key: M8, rol: "r1" }];
let r = await choqueDe(db, SAB, d, SQ8, "r1"); check(!!r && r.includes("08:00 (Pavelló Congost)"), "8:00 Manresa + 8:00 Sant Quirze → rechazado: " + r);
r = await choqueDe(db, SAB, d, M10, "r1"); check(r === null, "mismo pabellón 2 h después → permitido");
r = await choqueDe(db, SAB, d, V930, "r1"); check(!!r, "9:30 Vic (1 h 30 después) → rechazado: " + r);
r = await choqueDe(db, SAB, d, M830, "r1"); check(!!r, "mismo pabellón 30 min después (otra pista) → aviso: " + r);
r = await choqueDe(db, SAB, d, M9, "r1"); check(r === null, "mismo pabellón 1 h después (otra pista, sin acento) → permitido");
r = await choqueDe(db, SAB, d, SQ8, "r1", true); check(r === null, "8:00 Sant Quirze confirmado (forzar) → permitido");
r = await choqueDe(db, SAB, d, M8, "r2", true); check(!!r && r.includes("ya está en este partido"), "mismo partido otro puesto, aunque se fuerce → rechazado");
r = await choqueDe(db, SAB, d, M8, "r2"); check(!!r && r.includes("ya está en este partido como R1"), "mismo partido otro puesto → rechazado: " + r);
r = await choqueDe(db, SAB, d, M8, "r1"); check(r === null, "volver a guardar el mismo puesto → permitido");
asig = []; matches = [{ user_id: "u1", date: SAB, time: "16:00", venue: "PAVELLO LES COMES - PISTA 2" }, { user_id: "u1", date: SAB, time: "08:00", venue: "PAVELLÓ SANT QUIRZE" }];
r = await choqueDe(db, SAB, d, I16, "r1"); check(r === null, "iSquad: el mismo partido (otra pista, sin acento) → permitido");
r = await choqueDe(db, SAB, d, M8, "r1"); check(!!r && r.includes("en iSquad el partido de las 08:00 (Pavelló Sant Quirze)"), "iSquad: 8:00 en Sant Quirze → rechazado: " + r);
r = await choqueDe(db, SAB, { ...d, user_id: null }, M8, "r1"); check(r === null, "sin cuenta: no se mira iSquad");
r = await choqueDe(db, SAB, d, `${DOM} 08:00|X|Y`, "r1"); check(r === null, "otro día → permitido");
// lote: 3 asignaciones, la 2ª choca con la 1ª (misma hora, otro pabellón) → sin forzar se guardan 2 y falla 1; con forzar, las 3.
asig = []; matches = [];
let res = await (await lote(db, { finde: SAB, items: [{ key: M8, rol: "r1", disp_id: "x" }, { key: SQ8, rol: "r1", disp_id: "x" }, { key: I16, rol: "r1", disp_id: "x" }] })).json();
check(res.ok && res.hechos === 2 && res.fallos.length === 1 && res.fallos[0].key === SQ8, "lote sin forzar: 2 guardadas, falla la que choca · " + JSON.stringify(res));
asig = [];
res = await (await lote(db, { finde: SAB, forzar: true, items: [{ key: M8, rol: "r1", disp_id: "x" }, { key: SQ8, rol: "r1", disp_id: "x" }, { key: I16, rol: "r1", disp_id: "x" }] })).json();
check(res.ok && res.hechos === 3 && !res.fallos.length, "lote con forzar (confirmado): las 3");
res = await (await lote(db, { finde: SAB, items: [] })).json();
check(!!res.error, "lote vacío: petición no válida");
// importar: nueva, actualiza (mismo nombre sin acentos), la de la app no se toca, población que no existe, fila incompleta.
dispYa = [{ id: "a1", nombre: "MARTA ROCA", user_id: null }, { id: "a2", nombre: "LAIA ESTEVE PUIG", user_id: "u9" }];
const F = (fila: number, nombre: string, poblacion: string, extra = {}) => ({ fila, nombre, poblacion, coche: true, sab: "manana", dom: "no", ...extra });
res = await (await importar(db, { finde: SAB, filas: [F(2, "Jordi Inventat", "Terrassa"), F(3, "Marta Rocà", "Barcelona"), F(4, "Laia Esteve Puig", "Igualada"), F(5, "Pere Sense", "Villarriba"), F(6, "Xx", "Vic", { sab: "quizá" })] })).json();
check(res.ok && res.nuevos === 1 && res.actualizados === 1, "importar: 1 nueva y 1 actualizada · " + JSON.stringify(res));
check(res.errores.map((e: { fila: number }) => e.fila).join(",") === "4,5,6", "importar: errores en las filas 4 (app), 5 (población) y 6 (incompleta)");
check(/desde la app/.test(res.errores[0].error) && /Villarriba/.test(res.errores[1].error), "importar: motivos claros");
check(insertadas.length === 1 && insertadas[0].origen === "designador" && insertadas[0].lat === 41.58, "importar: la nueva se guarda como del designador y con coordenadas");
res = await (await importar(db, { finde: SAB, filas: [] })).json();
check(!!res.error, "importar vacío: petición no válida");
// ---------- Ubicar por nombre (respuestas de Photon de verdad, 4-nov-2026) ----------
const PHOTON: Record<string, unknown> = {
  "PAVELLO PACO MARTIN": { geometry: { coordinates: [2.39, 41.5] }, properties: { name: "Pavelló d'Esports Paco Martín", city: "Vilassar de Mar", osm_key: "leisure", osm_value: "sports_centre" } },
  "PAVELLO MUNICIPAL SANT JORDI": { geometry: { coordinates: [0.71, 40.88] }, properties: { name: "Pavelló Municipal", city: "el Perelló", osm_key: "leisure", osm_value: "sports_centre" } },
  "COL.LEGI SAGRAT COR SARRIA": { geometry: { coordinates: [0.58, 40.71] }, properties: { name: "Col·legi Sagrat Cor", city: "Amposta", osm_key: "amenity", osm_value: "school" } },
  "POLIESPORTIU DE CALAF": { geometry: { coordinates: [1.51, 41.73] }, properties: { name: "Poliesportiu Municipal", city: "Calaf", osm_key: "leisure", osm_value: "sports_centre" } },
};
const fetch0 = globalThis.fetch;
globalThis.fetch = (async (u: string | URL) => { const q = decodeURIComponent(String(u).split("&q=")[1] || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const f = PHOTON[Object.keys(PHOTON).find((k) => q.startsWith(k)) || ""]; return new Response(JSON.stringify({ features: f ? [f] : [] })); }) as typeof fetch;
sinCache = true;
const Pt = (pab: string, l: string) => ({ d: `${SAB} 10:00`, c: true, l, v: "X", cl: "", cv: "", comp: "", cat: "", pab, pista: "" });
const casos: [string, string, boolean][] = [["PAVELLÓ PACO MARTIN - PISTA 1", "VOLEI VILASSAR", true], ["PAVELLÓ MUNICIPAL SANT JORDI", "CEVOL TORREDEMBARRA", false],
  ["COL.LEGI SAGRAT COR SARRIÀ", "ESPANYOL BLAU", false], ["POLIESPORTIU DE CALAF", "SENIOR MASCULI CV CALAF", true]];
for (const [pab, l, bien] of casos) { const r = await porNombre(db, Pt(pab, l), [Pt(pab, l)]); check(!!r === bien, `por nombre: ${pab} (${l}) → ${r ? r.at.join(",") : "no"} (esperado: ${bien ? "sí" : "no"})`); }
sinCache = false; globalThis.fetch = fetch0;
// ---------- Ubicar a mano ----------
res = await (await ubicar(db, { pab: "PAVELLÓ MUNICIPAL CABRILS - PISTA 1", texto: "Cabrils" })).json();
check(res.ok && pabs.length === 1 && pabs[0].pab_key === "PAVELLO MUNICIPAL CABRILS" && pabs[0].texto === "Cabrils", "ubicar: guardado con la clave sin pista · " + JSON.stringify(pabs[0]));
res = await (await ubicar(db, { pab: "PAVELLÓ X", texto: "Villarriba" })).json();
check(/No encuentro "Villarriba"/.test(res.error || ""), "ubicar: lugar que no existe → error claro");
res = await (await ubicar(db, { pab: "PAVELLÓ MUNICIPAL CABRILS", quitar: true })).json();
check(res.ok && borrados.includes("designa_pab"), "ubicar: quitar la ubicación a mano");
res = await (await ubicar(db, { pab: "", texto: "Cabrils" })).json();
check(!!res.error, "ubicar sin pabellón: petición no válida");
// ---------- Equipos de cada árbitro ----------
favs = [{ user_id: "u1", club_id: "77", club: "CE SABADELL", team: "CE SABADELL", cat: "PRIMERA DIVISION JUVENIL", rol: "entrenador" }];
const ps = [{ d: `${SAB} 12:00`, c: true, l: "CV MANRESA", v: "CE SABADELL", cl: "12", cv: "77", comp: "", cat: "PRIMERA DIVISION JUVENIL FEMENINO", pab: "PAVELLO CONGOST", pista: "" },
  { d: `${SAB} 18:00`, c: true, l: "CE SABADELL", v: "CV VIC", cl: "77", cv: "30", comp: "", cat: "TERCERA DIVISION SENIOR FEMENINO", pab: "PAVELLO DEL SUD", pista: "" }];
const eq = (await equiposDe(db, ["u1"], ps)).get("u1");
check(eq && eq.clubs.length === 1 && eq.clubs[0].id === "77" && eq.juega.length === 1 && eq.juega[0].d === `${SAB} 12:00` && eq.juega[0].rol === "entrenador", "equipos: su partido (misma categoría) y su club; el sénior del club no es suyo · " + JSON.stringify(eq));
check((await equiposDe(db, [], ps)).size === 0, "equipos: sin árbitros con cuenta, nada");
Deno.exit(fallos ? 1 : 0);
