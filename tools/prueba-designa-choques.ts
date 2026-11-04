// Prueba de los choques del designador (choqueDe en supabase/functions/designa) con una base de datos simulada.
// Lanzar desde la raíz del repo (necesita las variables VAPID_* de verdad, porque _shared/push.ts las valida al cargar):
//   VAPID_SUBJECT=mailto:x@example.com VAPID_PUBLIC=... VAPID_PRIVATE=... SUPABASE_URL=http://x SUPABASE_SERVICE_ROLE_KEY=x \
//   deno run --no-check -A tools/prueba-designa-choques.ts
// Copia la función sin Deno.serve junto a index.ts (para que resuelvan los imports de _shared) y la borra al acabar.
const DIR = new URL("../supabase/functions/designa/", import.meta.url);
const MOD = new URL("_prueba_mod.ts", DIR);
await Deno.writeTextFile(MOD, (await Deno.readTextFile(new URL("index.ts", DIR))).split("Deno.serve(")[0] + "\nexport { choqueDe };\n");
// deno-lint-ignore no-explicit-any
let choqueDe: any;
try { ({ choqueDe } = await import(MOD.href)); } finally { await Deno.remove(MOD); }
const SAB = "2026-11-07", DOM = "2026-11-08";
const P = (h: string, l: string, v: string, pab: string, d = SAB) => ({ d: `${d} ${h}`, c: true, l, v, cl: "", cv: "", comp: "", cat: "SENIOR", pab, pista: "" });
const feedRows = [P("08:00", "CV MANRESA", "CV A", "PAVELLÓ CONGOST - PISTA 1"), P("08:00", "CV SANT QUIRZE", "CV B", "PAVELLÓ SANT QUIRZE"),
  P("10:00", "CV MANRESA", "CV C", "PAVELLÓ CONGOST - PISTA 1"), P("09:30", "CV VIC", "CV D", "PAVELLÓ OLÍMPIC"), P("16:00", "IGUALADA VC", "CV E", "PAVELLÓ LES COMES")];
const key = (p: ReturnType<typeof P>) => `${p.d}|${p.l}|${p.v}`;
let asig: { match_key: string; rol: string }[] = [], matches: { user_id: string; date: string; time: string; venue: string }[] = [];
// deno-lint-ignore no-explicit-any
const db = { from(t: string) { const q: any = { select: () => q, eq: () => q, in: () => q, is: () => q, order: () => q, upsert: async () => ({}),
  maybeSingle: async () => ({ data: t === "pub_cache" ? { data: feedRows, fetched_at: new Date().toISOString() } : null }),
  // deno-lint-ignore no-explicit-any
  then: (ok: any) => ok({ data: t === "designa_asig" ? asig : t === "matches" ? matches : [] }) }; return q; } };
const d = { id: "x", nombre: "FERRAN SANCHIS", user_id: "u1" };
let fallos = 0; const check = (c: boolean, t: string) => { console.log((c ? "OK   " : "FALLA") + " " + t); if (!c) fallos++; };
const [M8, SQ8, M10, V930, I16] = feedRows.map(key);
asig = [{ match_key: M8, rol: "r1" }];
let r = await choqueDe(db, SAB, d, SQ8, "r1"); check(!!r && r.includes("08:00 (Pavelló Congost)"), "8:00 Manresa + 8:00 Sant Quirze → rechazado: " + r);
r = await choqueDe(db, SAB, d, M10, "r1"); check(r === null, "mismo pabellón 2 h después → permitido");
r = await choqueDe(db, SAB, d, V930, "r1"); check(!!r, "9:30 Vic (1 h 30 después) → rechazado: " + r);
r = await choqueDe(db, SAB, d, M8, "r2"); check(!!r && r.includes("ya está en este partido como R1"), "mismo partido otro puesto → rechazado: " + r);
r = await choqueDe(db, SAB, d, M8, "r1"); check(r === null, "volver a guardar el mismo puesto → permitido");
asig = []; matches = [{ user_id: "u1", date: SAB, time: "16:00", venue: "PAVELLO LES COMES - PISTA 2" }, { user_id: "u1", date: SAB, time: "08:00", venue: "PAVELLÓ SANT QUIRZE" }];
r = await choqueDe(db, SAB, d, I16, "r1"); check(r === null, "iSquad: el mismo partido (otra pista, sin acento) → permitido");
r = await choqueDe(db, SAB, d, M8, "r1"); check(!!r && r.includes("en iSquad el partido de las 08:00 (Pavelló Sant Quirze)"), "iSquad: 8:00 en Sant Quirze → rechazado: " + r);
r = await choqueDe(db, SAB, { ...d, user_id: null }, M8, "r1"); check(r === null, "sin cuenta: no se mira iSquad");
r = await choqueDe(db, SAB, d, `${DOM} 08:00|X|Y`, "r1"); check(r === null, "otro día → permitido");
Deno.exit(fallos ? 1 : 0);
