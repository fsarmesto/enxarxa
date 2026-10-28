// Pruebas de los avisos (deno test -A supabase/functions/_shared/): textos en los 2 idiomas, paginación y quién recibe
// los avisos del domingo. Con una base de datos simulada y claves VAPID de prueba: no se envía nada a nadie.
import webpush from "npm:web-push@3.6.7";
import { assert, assertEquals } from "jsr:@std/assert@1.0.8";

const k = webpush.generateVAPIDKeys();
Deno.env.set("VAPID_SUBJECT", "mailto:prueba@example.com");
Deno.env.set("VAPID_PUBLIC", k.publicKey);
Deno.env.set("VAPID_PRIVATE", k.privateKey);
const { textos } = await import("./textos.ts");
const { todas, porIds } = await import("./db.ts");
const { avisoCobros, porPedir } = await import("./domingo.ts");
const { avisoResultados } = await import("./resultados.ts");

const P = { date: "2026-10-30", time: "18:00", teams: "CV EXEMPLE vs CLUB PROVA", venue: "PAVELLO DE PROVA" };
// Todos los textos del catálogo con datos inventados.
function todos(l: "es" | "ca") {
  const t = textos(l);
  return [t.nueva(P, "r2"), t.cambio(P, { ...P, time: "17:00" }), t.estadoDesig(P, "SUSPENDIDO"), t.quitada(P),
    t.eqEstado("A – B", P.date, "Aplazado"), t.eqHorario("A – B", P.date, "12:00"), t.eqCambioHorario("A – B", P.date, "12:00", "2026-10-29", "11:00"),
    t.eqCambioFecha("A – B", P.date, "2026-10-29"), t.eqResultado("A", 3, 1, "B", true, P.date), t.cobro(23.5, ["mañana", "tarde"], 2), t.cobro(0, [], 1),
    t.resultado1(true, P), t.resultado1(false, P), t.resultadoN(true, [P, P]), t.domingo(1), t.domingo(3), t.prueba(), t.inactiva("2026-11-26"),
    t.designan(), t.designaciones(["Cadete (1/2)"]), t.designaciones(["A", "B"]), t.salud({ fallan: 9, total: 16 }), t.salud({ horas: 14 })];
}

Deno.test("cada aviso tiene título y texto en castellano y en catalán, y son distintos", () => {
  const es = todos("es"), ca = todos("ca");
  assertEquals(es.length, ca.length);
  for (const [i, a] of es.entries()) {
    assert(a.title && a.body && ca[i].title && ca[i].body, `aviso ${i} vacío`);
    if (!/^Vòlei EnXarxa$/.test(a.title)) assert(a.title !== ca[i].title || a.body !== ca[i].body, `aviso ${i} igual en los 2 idiomas`);
  }
});

Deno.test("los avisos en catalán no llevan palabras castellanas", () => {
  const sp = /\b(partido|partidos|designación|resultado|subido|cuenta|semana|árbitro|antes|horario|pide|hoy|mañana|tarde|tus?|el lunes|está|aún)\b|ñ|¿|¡/i;
  for (const a of todos("ca")) for (const s of [a.title, a.body]) assert(!sp.test(s.replace(/Cv Exemple – Club Prova|Pavello De Prova/g, "")), `castellano en: ${s}`);
});

Deno.test("todas() y porIds() leen más de 1000 filas sin repetir", async () => {
  const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i, user_id: `u${i % 450}` }));
  // deno-lint-ignore no-explicit-any
  const q = (f?: string[]): any => ({ range: (a: number, b: number) => { const base = f ? rows.filter((r) => f.includes(r.user_id)) : rows;
    return Promise.resolve({ data: base.slice(a, Math.min(b, a + 999) + 1), error: null }); } });
  const t = await todas<{ id: number }>(() => q());
  assertEquals(t.length, 2500); assertEquals(new Set(t.map((r) => r.id)).size, 2500);
  const users = Array.from({ length: 450 }, (_, i) => `u${i}`);
  assertEquals((await porIds(users, (g: string[]) => { assert(g.length <= 100); return q(g); })).length, 2500);
});

// Base de datos simulada para los avisos del domingo: matches/profiles en memoria y push_log que se va llenando.
// deno-lint-ignore no-explicit-any
function fakeDb(tablas: Record<string, any[]>, lang: Record<string, string> = {}) {
  const log = new Map<string, unknown>();
  // deno-lint-ignore no-explicit-any
  const from = (t: string): any => {
    const f: Record<string, unknown> = {}; let lo = "", hi = "";
    const rows = () => (tablas[t] || []).filter((r) => (!f.user_id || r.user_id === f.user_id) && (!lo || !r.date || r.date >= lo) && (!hi || !r.date || r.date <= hi));
    // deno-lint-ignore no-explicit-any
    const o: any = { select: () => o, order: () => o, not: () => o, is: () => o, neq: () => o, limit: () => o, update: () => o,
      gte: (_: string, v: string) => (lo = v, o), lte: (_: string, v: string) => (hi = v, o), eq: (c: string, v: unknown) => (f[c] = v, o),
      range: (a: number, b: number) => Promise.resolve({ data: rows().slice(a, b + 1), error: null }),
      upsert: (r: { user_id: string; key: string; msg: unknown }) => { log.set(`${r.user_id}|${r.key}`, r.msg); return Promise.resolve({}); },
      maybeSingle: () => Promise.resolve({ data: t === "push_log" ? (log.has(`${f.user_id}|${f.key}`) ? {} : null) : t === "profiles" ? { lang: lang[f.user_id as string] || "ca" } : null }),
      then: (ok: (x: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve({ data: t === "push_subs" ? [] : rows() }).then(ok, ko) };
    return o;
  };
  return { db: { from }, log };
}

Deno.test("cobros del domingo: solo a quien le queda algo por pedir, y una vez", async () => {
  const M = (user_id: string, o: object = {}) => ({ user_id, comp: "TERCERA", paid: false, fcvb_pago: null, fcvb_accion: null, fcvb_tarifa: null, fcvb_gastos: null, ...o });
  const matches = [M("u1"), M("u1", { fcvb_pago: "NO SOLICITADO", fcvb_tarifa: "30", fcvb_gastos: "10" }), M("u2", { fcvb_pago: "SOLICITADO" }),
    M("u3", { fcvb_pago: "PAGADO - 20/10/2026" }), M("u4", { paid: true }), M("u5", { comp: "SELECCION CATALANA" }),
    M("u6", { fcvb_pago: "PLAZO SOLICITUD PAGO TERMINADO" }), M("u7", { fcvb_tarifa: "0", fcvb_gastos: "0" }), M("jugador")];
  assertEquals(matches.filter(porPedir).length, 3);
  const { db, log } = fakeDb({ matches, profiles: ["u1", "u2", "u3", "u4", "u5", "u6", "u7"].map((user_id) => ({ user_id })) });
  assertEquals((await avisoCobros(db)).enviados, 1);
  assertEquals([...log.keys()].map((x) => x.split("|")[0]), ["u1"]);
  assert(/Et queden 2 partits/.test(JSON.stringify([...log.values()][0])));
  assertEquals((await avisoCobros(db)).enviados, 0);
});

Deno.test("resultados del domingo: R1, otro rol y varios; sin estatales, selecciones ni suspendidos; una vez", async () => {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date()), noon = Date.parse(`${today}T12:00:00Z`);
  const mon = new Date(noon - ((new Date(noon).getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
  const M = (user_id: string, o: object = {}) => ({ user_id, id: user_id + Math.random(), date: mon, time: "10:00", teams: "CV EXEMPLE vs CLUB PROVA", venue: "PAV",
    comp: "TERCERA DIVISION SENIOR", estado: "PENDIENTE", role: "r1", staff_checked: "x", ...o });
  const matches = [M("u1"), M("u2", { role: "r2" }), M("u3"), M("u3", { role: "r2" }), M("u4", { comp: "SUPERLIGA FEMENINA" }),
    M("u4", { comp: "SELECCION CATALANA" }), M("u4", { estado: "SUSPENDIDO" })];
  const { db, log } = fakeDb({ matches }, { u2: "es" });
  assertEquals((await avisoResultados(db, Date.now() - 1)).enviados, 3);
  const msg = (u: string) => JSON.stringify([...log.entries()].find(([k]) => k.startsWith(u + "|"))?.[1]);
  assert(/Encara no has pujat el resultat/.test(msg("u1")));
  assert(/El resultado aún no está subido/.test(msg("u2")));
  assert(/2 partits sense resultat/.test(msg("u3")));
  assertEquals((await avisoResultados(db, Date.now() - 1)).enviados, 0);
});

Deno.test("aTurnos(): como mucho n a la vez y los resultados en orden", async () => {
  const { aTurnos } = await import("./db.ts");
  let ahora = 0, max = 0;
  const r = await aTurnos(Array.from({ length: 16 }, (_, i) => i), 4, async (i: number) => {
    ahora++; max = Math.max(max, ahora); await new Promise((ok) => setTimeout(ok, 5 + (i % 3) * 5)); ahora--; return i * 2;
  });
  assertEquals(max, 4);
  assertEquals(r, Array.from({ length: 16 }, (_, i) => i * 2));
});
