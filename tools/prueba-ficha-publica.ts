// Respaldo con la ficha pública del árbitro (4-nov-2026): lector de la ficha, sincronización con una base de datos
// simulada (nuevas, cambios, quitadas, lo que ya estaba) y fusión cuando vuelve el área privada. iSquad simulado.
// Lanzar desde la raíz del repo (push.ts valida las VAPID_* al cargar):
//   VAPID_SUBJECT=mailto:x@example.com VAPID_PUBLIC=... VAPID_PRIVATE=... SUPABASE_URL=http://x SUPABASE_SERVICE_ROLE_KEY=x \
//   deno run --no-check -A tools/prueba-ficha-publica.ts
import { fechaFicha, parseFicha, staffDe, cortesEquipos } from "../supabase/functions/_shared/fichapub.ts";

let ok = 0, mal = 0;
const check = (c: boolean, t: string) => { c ? ok++ : mal++; console.log(c ? "OK  " : "MAL ", t); };
const HOY = new Date("2026-11-04T12:00:00Z");

// ---------- Lector ----------
// Ficha real de Ferran (bajada el 4-nov-2026 desde Supabase) y una segunda fila inventada, con anotador y en catalán.
const REAL = `<div class='table-responsive'><table class='table'><tr class='success'><th colspan=3>CAMPIONAT DE CATALUNYA 1a DIV. INF MASC - PRIMERA FASE GRUP A</th></tr><tr class='warning'><td>CN TERRASSA A - VA DE PEIX Arenys Vòlei</td><td>sábado 07 de noviembre a las 9:00</td><td><i-t page='common'>Pabellón</i-t>: PAVELLÓ VOLEIBOL CN TERRASSA  - Pista 1<br/>CARRER DELS JOCS OLíMPICS, 5, 08225 TERRASSA, BARCELONA, ESPAñA</td></tr><tr><td></td><td style='font-weight: bold;'>ARBITRO</td><td style='font-weight: bold;'>FERRAN SANCHIS ARMESTO</td></tr>`;
const OTRA = `<tr class='success'><th colspan=3>LLIGA CATALANA SENIOR FEM</th></tr><tr class='warning'><td>CV SANT CUGAT - B - CV MOLLET</td><td>dissabte 10 de gener a les 17:30</td><td>Pavelló: PAVELLÓ LA RIERA<br/>C/ MAJOR 1, 08100 MOLLET</td></tr><tr><td></td><td>ANOTADOR</td><td>FERRAN SANCHIS ARMESTO</td></tr>`;
const fichaTxt = (extra = "") => REAL + extra + "</table></div>";
const f = parseFicha(fichaTxt(OTRA), HOY);
check(f.length === 2, `2 designaciones · ${f.length}`);
check(f[0].comp === "CAMPIONAT DE CATALUNYA 1a DIV. INF MASC - PRIMERA FASE GRUP A" && f[0].equipos === "CN TERRASSA A - VA DE PEIX Arenys Vòlei", "competición y equipos");
check(f[0].date === "2026-11-07" && f[0].time === "09:00", `fecha y hora · ${f[0].date} ${f[0].time}`);
check(f[0].venue === "PAVELLÓ VOLEIBOL CN TERRASSA - Pista 1" && f[0].addr === "CARRER DELS JOCS OLíMPICS, 5, 08225 TERRASSA, BARCELONA, ESPAñA", `pabellón y dirección · ${f[0].venue} | ${f[0].addr}`);
check(f[0].funcion === "ARBITRO" && f[1].funcion === "ANOTADOR", "función del árbitro");
check(f[1].date === "2027-01-10" && f[1].time === "17:30", `enero: año siguiente de la temporada; catalán · ${f[1].date} ${f[1].time}`);
check(fechaFicha("domingo 31 de agosto a las 10:00", HOY)?.date === "2026-08-31", "agosto: año en que empieza la temporada");
check(parseFicha("<div>SIN PARTIDOS</div>", HOY).length === 0, "SIN PARTIDOS: ninguna");
check(JSON.stringify(cortesEquipos("CV SANT CUGAT - B - CV MOLLET")) === JSON.stringify([["CV SANT CUGAT", "B - CV MOLLET"], ["CV SANT CUGAT - B", "CV MOLLET"]]), "equipos con \" - \": todos los cortes");
const st = staffDe([{ f: "r1", n: "MARTA ROCA" }, { f: "r2", n: "FERRAN SANCHIS ARMESTO" }, { f: "an", n: "PAU MARTI" }], "Ferran Sanchis Armesto", "ARBITRO");
check(st.role === "r2" && st.team === "t3" && st.crew?.find((c) => c.me)?.f === "r2", `con el Previo: 2n árbitro, equipo de 3 · ${JSON.stringify(st)}`);
check(staffDe([], "Ferran Sanchis Armesto", "ANOTADOR").role === "an" && staffDe([], "Ferran Sanchis Armesto", "ARBITRO").role === "r1", "sin Previo: lo que dice la ficha");

// ---------- Base de datos simulada ----------
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const T: Record<string, Row[]> = { matches: [], profiles: [], pub_cache: [], push_log: [], push_subs: [], venues: [], isquad_credentials: [] };
const KEYS: Record<string, string[]> = { matches: ["user_id", "id"], pub_cache: ["key"], push_log: ["user_id", "key"], profiles: ["user_id"], venues: ["user_id", "venue_key"] };
function q(tabla: string) {
  const filtros: ((r: Row) => boolean)[] = [];
  let modo = "select", datos: Row | Row[] | null = null, opts: Row = {}, uno = false;
  const run = () => {
    const rows = T[tabla] ||= [];
    const pasa = (r: Row) => filtros.every((f) => f(r));
    if (modo === "update") { rows.filter(pasa).forEach((r) => Object.assign(r, datos)); return { data: null, error: null }; }
    if (modo === "delete") { T[tabla] = rows.filter((r) => !pasa(r)); return { data: null, error: null }; }
    if (modo === "upsert" || modo === "insert") {
      const nuevos: Row[] = [];
      for (const d of (Array.isArray(datos) ? datos : [datos]) as Row[]) {
        const k = KEYS[tabla] || ["id"], ya = rows.find((r) => k.every((c) => r[c] === d[c]));
        if (ya) { if (!opts.ignoreDuplicates) Object.assign(ya, d); } else { rows.push({ ...d }); nuevos.push(d); }
      }
      return { data: nuevos, error: null };
    }
    const out = rows.filter(pasa);
    return { data: uno ? (out[0] ?? null) : out, error: null };
  };
  // deno-lint-ignore no-explicit-any
  const b: any = {
    select: () => b, order: () => b, range: () => b, limit: () => b,
    eq: (k: string, v: unknown) => { filtros.push((r) => r[k] === v); return b; },
    neq: (k: string, v: unknown) => { filtros.push((r) => r[k] !== v); return b; },
    gte: (k: string, v: string) => { filtros.push((r) => r[k] >= v); return b; },
    like: (k: string, v: string) => { const p = v.replace(/%$/, ""); filtros.push((r) => String(r[k]).startsWith(p)); return b; },
    is: (k: string, v: unknown) => { filtros.push((r) => (r[k] ?? null) === v); return b; },
    not: (k: string, _op: string, v: unknown) => { filtros.push((r) => (r[k] ?? null) !== v); return b; },
    in: (k: string, v: unknown[]) => { filtros.push((r) => v.includes(r[k])); return b; },
    maybeSingle: async () => { uno = true; return run(); }, single: async () => { uno = true; return run(); },
    update: (d: Row) => { modo = "update"; datos = d; return b; }, delete: () => { modo = "delete"; return b; },
    upsert: (d: Row | Row[], o: Row = {}) => { modo = "upsert"; datos = d; opts = o; return b; },
    insert: (d: Row | Row[]) => { modo = "insert"; datos = d; return b; },
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  };
  return b;
}
const db = { from: q, rpc: async () => ({ data: 0, error: null }) };

// ---------- iSquad simulado ----------
let ficha = fichaTxt(OTRA), fetches: string[] = [];
const BUSCA: Row[] = [   // el buscador público: id del partido por local, visitante, fecha y hora
  { id_partido: 82686, fecha: "07/11/2026", hora: "9:00", nombre_local: "CN TERRASSA A", nombre_visitante: "VA DE PEIX Arenys Vòlei" },
  { id_partido: 90001, fecha: "10/01/2027", hora: "17:30", nombre_local: "CV SANT CUGAT - B", nombre_visitante: "CV MOLLET" },
];
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input)); fetches.push(url.pathname);
  if (url.pathname === "/partidos_arbitro.php") return new Response(new TextEncoder().encode(ficha), { status: 500 });   // iSquad la da SIEMPRE con 500
  if (url.pathname === "/json/isquad_proxy.php") {
    const qq = new URLSearchParams(String(init?.body)).get("q");
    return Response.json({ data: { partidos: BUSCA.filter((p) => p.nombre_local === qq) }, has_more: { partidos: false } });
  }
  if (url.pathname === "/previo.php") {
    const id = url.searchParams.get("id_partido");
    const div = (i: number, f: string, n: string) => `<div class="div${i}"><div><i-t page='common'>${f}</i-t></div><div>${n}</div></div>`;
    return new Response(id === "82686" ? div(1, "ARBITRO", "FERRAN SANCHIS ARMESTO") + div(2, "ARBITRO", "MARTA ROCA") : "");
  }
  return new Response("", { status: 404 });
}) as typeof fetch;

const { syncPublico, syncUser } = await import("../supabase/functions/_shared/sync.ts");
const U = "u1";
T.profiles.push({ user_id: U, nombre: "Ferran Sanchis Armesto", foto: null, id_arbitro: "2155022", tipo: "arbitro", last_error: null, lang: "es" });
const deU = () => T.matches.filter((m) => m.user_id === U);
const avisos = () => T.push_log.filter((p) => p.user_id === U).map((p) => p.key);

// 1) Ya tenía la de Terrassa del área privada (con otros textos: la ficha pone nombres en catalán): no se duplica.
T.matches.push({ user_id: U, id: "1IM1FGA072", id_partido: "82686", comp: "PRIMERA DIVISION INFANTIL MASCULINO", teams: "CN TERRASSA A vs FLOR D'ALBA ARENYS VÒLEI",
  date: "2026-11-07", time: "09:00", venue: "PAVELLÓ VOLEIBOL CN TERRASSA - Pista 1", venue_key: "CARRER DELS JOCS OLIMPICS, 5", role: "r1", estado: "PENDIENTE", staff_checked: null, missing_since: null, paid: false });
let r = await syncPublico(db as never, U, { notify: true });
check(r.ok && r.nuevas === 1, `1a lectura: ok, 1 nueva (la de enero) · ${JSON.stringify(r)}`);
check(deU().length === 2 && !!deU().find((m) => m.id === "1IM1FGA072") && !!deU().find((m) => m.id === "PUB-90001"), `Terrassa no se duplica; la nueva entra como PUB-90001 · ${deU().map((m) => m.id)}`);
const nueva = deU().find((m) => m.id === "PUB-90001")!;
check(nueva.role === "an" && nueva.teams === "CV SANT CUGAT - B vs CV MOLLET" && nueva.id_partido === "90001" && nueva.date === "2027-01-10", `la nueva: anotador, equipos bien cortados, partido público · ${nueva.role} ${nueva.teams}`);
check(JSON.stringify(avisos()) === JSON.stringify(["nueva:PUB-90001"]), `aviso solo de la nueva · ${avisos()}`);
check(T.profiles[0].last_error === "publico", "perfil marcado: datos de la ficha pública");
check(T.venues.some((v) => v.user_id === U && v.venue_key === "PAVELLO LA RIERA"), `pabellón nuevo apuntado para los km · ${T.venues.map((v) => v.venue_key)}`);

// 2) Otra lectura igual: nada nuevo, ningún aviso más.
r = await syncPublico(db as never, U, { notify: true });
check(r.ok && r.nuevas === 0 && avisos().length === 1, `2a lectura igual: nada nuevo ni avisos · ${JSON.stringify(r)}`);

// 3) Cambio de hora en Terrassa (la del área privada): se actualiza y se avisa.
ficha = fichaTxt(OTRA).replace("a las 9:00", "a las 10:30");
BUSCA[0].hora = "10:30";
r = await syncPublico(db as never, U, { notify: true });
const terr = deU().find((m) => m.id === "1IM1FGA072")!;
check(terr.time === "10:30" && terr.teams === "CN TERRASSA A vs FLOR D'ALBA ARENYS VÒLEI", `Terrassa a las 10:30, sin tocar sus textos · ${terr.time}`);
check(avisos().some((k) => k.startsWith("cambio:1IM1FGA072:2026-11-07|10:30")), `aviso de cambio · ${avisos()}`);

// 4) La de enero deja de salir: 1a vez solo se apunta; 2a vez se quita y se avisa. La del área privada no se toca.
ficha = fichaTxt().replace("a las 9:00", "a las 10:30");
await syncPublico(db as never, U, { notify: true });
check(!!deU().find((m) => m.id === "PUB-90001")?.missing_since, "1a vez que falta: solo se apunta");
await syncPublico(db as never, U, { notify: true });
check(!deU().find((m) => m.id === "PUB-90001") && avisos().some((k) => k.startsWith("quitada:PUB-90001")), `2a vez: se quita y se avisa · ${avisos()}`);
check(!!deU().find((m) => m.id === "1IM1FGA072"), "la del área privada sigue");

// 5) Sin contraseña de iSquad (alta nuestra): syncUser va directo a la ficha pública, sin tocar el área privada.
ficha = fichaTxt(OTRA); fetches = [];
r = await syncUser(db as never, U, { km: "none", deadline: Date.now() + 60_000, notify: true }) as Record<string, unknown>;
check(r.ok === true && r.publico === true && !fetches.some((p) => /loginunico|arbitros_designaciones/.test(p)), `sin contraseña: ficha pública, nada del área privada · ${JSON.stringify(r)} ${fetches.join(",")}`);
deU().find((m) => m.id === "PUB-90001")!.paid = true;   // lo marca como cobrado mientras tanto

// 6) Vuelve el área privada con la designación de verdad: la PUB- se borra y "pagado" pasa a la de verdad.
const mod = await import("../supabase/functions/_shared/sync.ts") as Record<string, unknown>;
const fundir = mod.fundirPublicos as ((db: unknown, u: string, m: unknown[]) => Promise<void>) | undefined;
check(typeof fundir === "function", "fundirPublicos exportada para la prueba");
if (fundir) {
  T.matches.push({ user_id: U, id: "SCF-0110", id_partido: "90001", date: "2027-01-10", time: "17:30", venue_key: "C/ MAJOR 1", paid: false });
  await fundir(db, U, [{ id: "1IM1FGA072", id_partido: "82686", date: "2026-11-07", time: "10:30", venue_key: "CARRER DELS JOCS OLIMPICS, 5" },
    { id: "SCF-0110", id_partido: "90001", date: "2027-01-10", time: "17:30", venue_key: "C/ MAJOR 1" }]);
  check(!deU().some((m) => m.id.startsWith("PUB-")) && deU().find((m) => m.id === "SCF-0110")?.paid === true, `fusión: sin PUB- y "pagado" pasa a la de verdad · ${deU().map((m) => m.id + (m.paid ? "(pagado)" : ""))}`);
}
console.log(`${ok} OK, ${mal} MAL`); Deno.exit(mal ? 1 : 0);
