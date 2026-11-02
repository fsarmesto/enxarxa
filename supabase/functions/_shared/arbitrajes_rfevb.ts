// Arbitrajes de competiciones estatales sacados de la RFEVB (2-nov-2026, Ferran): a un árbitro de Superliga, Superliga 2
// o Primera Nacional le salen en "Mis partidos" aunque la designación no esté en iSquad. La API de la RFEVB (rfevb.ts) da
// el equipo arbitral de cada partido (arb1 = 1r, arb2 = 2n, arb3 = anotador) en cuanto lo designan; se busca el nombre de
// cada árbitro de la app (profiles.nombre). Sin número de licencia: por nombre completo (mismas palabras, en cualquier
// orden, sin "de", "la"...). Hay pocos árbitros y casi nunca coinciden 2 nombres completos.
// - Filas "RFEVB-<id del partido>" en matches, con rol, equipo arbitral, pabellón, resultado y acta (de la RFEVB).
//   Salen en Mis partidos, hora de salida, iCal y compartir coche, pero NO en Cobros (los paga la RFEVB) ni en "pide el pago".
// - Si iSquad ya trae ese partido (misma fecha, competición estatal y hora o equipos), no se duplica: se queda el de iSquad
//   y, si había fila RFEVB-, se borra.
// - Avisos como los de iSquad (nueva, cambio, suspendido, ya no estás designado) con notifyChanges y fuente "la RFEVB". La
//   primera pasada de todas no avisa de nada (pub_cache "rfevb-arb-inicio").
// Lo lanza el cron de indexar cada 15 min: las jornadas recientes y próximas se releen cada 20 min (caché de rfevb.ts).
import { calendario, comunes, enTurnos, fechaIso, grupos, horaDe, jornada, partido, sets, type Grupo, type PartidoApi } from "./rfevb.ts";
import { norm, type Db } from "./publico.ts";
import { venueKey, venueLabel, type WithStaff } from "./isquad.ts";
import { notifyChanges, type Prev } from "./sync.ts";
import { todas } from "./db.ts";
import { ESTATAL } from "./resultados.ts";

// Nombre como conjunto de palabras: "ELVIRA CERDÁN, ALBERT" = "ALBERT ELVIRA CERDAN". "TP-" (prefijo que pone la RFEVB
// a algunos árbitros) y las partículas no cuentan.
const NO_CUENTAN = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y", "I", "TP", "D", "L"]);
export const claveNombre = (s: string) =>
  [...new Set(norm(s).split(/[^A-Z]+/).filter((w) => w.length > 1 && !NO_CUENTAN.has(w)))].sort().join(" ");

const FUNCIONES = ["r1", "r2", "an", "an"] as const;   // arb4: otro anotador o ayudante; si es él, como anotador
const compDe = (g: Grupo) => {
  const gen = g.genero === "F" ? "FEMENINO" : "MASCULINO";
  // Nombres que la web y las tarifas ya entienden (guessCat: sl1, sl2, pde; compParts: SL, SL2, PN).
  return g.nivel === "sl" ? `SUPERLIGA ${gen}` : g.nivel === "sl2" ? `SUPERLIGA 2 ${gen}` : `PRIMERA DIVISION NACIONAL SENIOR ${gen}`;
};
const estadoDe = (p: PartidoApi) => p.esSuspendido ? "SUSPENDIDO" : p.esAplazado ? "APLAZADO" : sets(p) ? "FINALIZADO" : "PENDIENTE";
const arbs = (p: PartidoApi) => [p.arb1, p.arb2, p.arb3, p.arb4].map((n) => (n || "").replace(/^\s*TP\s*-\s*/i, "").trim());

type Visto = { p: PartidoApi; g: Grupo };
// Partidos de la temporada (desde agosto) hasta dentro de 4 semanas, con su equipo arbitral. leidos: ids de los partidos
// de las jornadas que se han podido leer (solo de esos se puede decir que alguien "ya no está designado").
export async function partidosConArbitros(db: Db, deadline: number): Promise<{ lista: Visto[]; leidos: Set<number>; completo: boolean }> {
  const now = new Date(), desde = `${now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1}-08-01`;
  const hasta = new Date(Date.now() + 28 * 864e5).toISOString().slice(0, 10);
  const vistos = new Map<number, Visto>(), leidos = new Set<number>();
  let completo = true;
  for (const g of await grupos(db)) {
    if (Date.now() > deadline) { completo = false; break; }
    const cal = await calendario(db, g.id).catch(() => []);
    const js = cal.filter((j) => { const d = fechaIso(j.fecha); return d >= desde && d <= hasta; });
    const det = await enTurnos(js, 4, (j) => Date.now() > deadline ? Promise.resolve(null) : jornada(db, j).catch(() => null));
    for (const ps of det) if (ps) { for (const p of ps) { leidos.add(p.id); vistos.set(p.id, { p, g }); } } else completo = false;
  }
  // Un aplazado sale en 2 jornadas (la suya y la nueva): una sola vez, con los datos de la última leída.
  return { lista: [...vistos.values()], leidos, completo };
}

export async function aplicarArbitrajes(db: Db, deadline: number) {
  const { lista, leidos, completo } = await partidosConArbitros(db, deadline - 30_000);
  const ps = await todas<{ user_id: string; nombre: string | null }>(() => db.from("profiles").select("user_id, nombre").neq("tipo", "deportista").order("user_id"));
  const porClave = new Map<string, string[]>();
  for (const p of ps) {
    const k = claveNombre(p.nombre || "");
    if (k.split(" ").length >= 2) (porClave.get(k) || porClave.set(k, []).get(k)!).push(p.user_id);
  }
  // Partidos de cada árbitro de la app: [partido, su función]. Si 2 cuentas tienen el mismo nombre completo, a ninguna
  // (no se puede saber de quién es).
  const suyos = new Map<string, { v: Visto; f: number }[]>();
  for (const v of lista) arbs(v.p).forEach((n, f) => {
    const us = n ? porClave.get(claveNombre(n)) : undefined;
    if (us?.length === 1) (suyos.get(us[0]) || suyos.set(us[0], []).get(us[0])!).push({ v, f });
  });
  const previas = await todas<Prev & { user_id: string; acta_url: string | null }>(() => db.from("matches")
    .select("user_id, id, date, time, venue, comp, teams, role, staff_checked, missing_since, estado, acta_url").like("id", "RFEVB-%").order("user_id").order("id"));
  const { data: inicio } = await db.from("pub_cache").select("key").eq("key", "rfevb-arb-inicio").maybeSingle();
  const silencio = !inicio;
  const usuarios = new Set([...suyos.keys(), ...previas.map((m) => m.user_id)]);
  let filas = 0, avisos = 0, duplicados = 0;
  for (const u of usuarios) {
    if (Date.now() > deadline) break;
    const mios = suyos.get(u) || [];
    const fechas = [...new Set(mios.map(({ v }) => fechaIso(v.p.fecha || v.p.fecha_hora)))];
    // Lo que ya trae iSquad esos días (competiciones estatales): no se duplica.
    const { data: isq } = fechas.length
      ? await db.from("matches").select("id, date, time, comp, teams").eq("user_id", u).in("date", fechas).not("id", "like", "RFEVB-%")
      : { data: [] };
    const yaEnIsquad = (p: PartidoApi, d: string) => (isq || []).some((m: { date: string; time: string; comp: string; teams: string }) => {
      if (m.date !== d || !ESTATAL.test(m.comp || "")) return false;
      const [l, v] = (m.teams || "").split(/\s+vs\s+/i);
      return m.time === horaDe(p) || comunes(l || "", p.equipo_local) + comunes(v || "", p.equipo_visitante) >= 2;
    });
    const rows: (WithStaff & Record<string, unknown>)[] = [], fuera: string[] = [];
    for (const { v: { p, g }, f } of mios) {
      const d = fechaIso(p.fecha || p.fecha_hora), id = `RFEVB-${p.id}`;
      if (yaEnIsquad(p, d)) { fuera.push(id); continue; }
      // Dirección con la población (getPartido; caché de 20 min, o 3 días si ya se jugó) y la foto del acta.
      const det = await partido(db, p.id, !!sets(p)).catch(() => p);
      const n = arbs(det.arb1 ? det : p), s = sets(det) || sets(p);
      const role = FUNCIONES[f], has = (i: number) => !!n[i];
      const team = has(0) && has(1) && has(2) ? "t3" : has(0) && has(1) ? "t2a" : has(0) && has(2) ? "t2b" : "t1";
      const venue = (det.pabellon || p.pabellon || "").trim(), addr = (det.ubicacion || det.direccion || p.direccion || "").trim();
      const acta = String(det.imagenActa || "").match(/href='([^']+)'/)?.[1] || null;
      rows.push({
        id, comp: compDe(g), phase: [g.fase, /UNIC/i.test(g.nombre) ? "" : g.nombre].filter(Boolean).join(" · "),
        teams: `${(p.equipo_local || "").trim().toUpperCase()} vs ${(p.equipo_visitante || "").trim().toUpperCase()}`,
        estado: estadoDe(det.id ? det : p), date: d, time: horaDe(p), venue, addr, venue_key: venueKey(venue, addr), desig_id: null,
        id_partido: `rfevb:${p.id}`, eq_l: null, eq_v: null,
        role, team, crew: n.map((x, i) => x ? { f: FUNCIONES[i], n: x, me: i === f } : null).filter(Boolean),
        staff_checked: new Date().toISOString(), last_seen: new Date().toISOString(), missing_since: null,
        ...(s ? { res_l: s[0], res_v: s[1], res_at: new Date().toISOString() } : {}),
        ...(acta ? { acta_url: acta, acta_at: new Date().toISOString() } : {}),
        staff: { role, team } as WithStaff["staff"],
      });
    }
    // Las filas RFEVB- que ahora trae iSquad: fuera, sin aviso.
    for (const id of fuera) if (previas.some((m) => m.user_id === u && m.id === id)) { await db.from("matches").delete().eq("user_id", u).eq("id", id); duplicados++; }
    const prev = previas.filter((m) => m.user_id === u && !fuera.includes(m.id) && leidos.has(+m.id.slice(6)))
      .filter((m) => m.date >= new Date().toISOString().slice(0, 10));
    if (rows.length) {
      const { error } = await db.from("matches").upsert(rows.map(({ staff: _s, ...r }) => ({ ...r, user_id: u })), { onConflict: "user_id,id" });
      if (error) { console.error("arbitrajes rfevb", error.message); continue; }
      filas += rows.length;
      // Pabellones nuevos (para km, trayecto y hora de salida).
      const { data: known } = await db.from("venues").select("venue_key").eq("user_id", u);
      const have = new Set((known || []).map((x: { venue_key: string }) => x.venue_key)), nuevos = new Map<string, WithStaff>();
      for (const r of rows) if (r.venue_key && !have.has(r.venue_key) && !nuevos.has(r.venue_key)) nuevos.set(r.venue_key, r);
      if (nuevos.size) await db.from("venues").insert([...nuevos].map(([k, r]) => ({ user_id: u, venue_key: k, label: venueLabel(r.venue, r.addr), km: null })));
    }
    // "now" con solo los partidos de jornadas leídas: así un fallo al leer una jornada no parece una designación quitada.
    avisos += await notifyChanges(db, u, prev, rows.filter((r) => leidos.has(+String(r.id).slice(6))), "la RFEVB", silencio, true).catch(() => 0);
  }
  // La primera pasada sin avisos acaba cuando se ha leído todo (si no, la siguiente avisaría de lo que no se leyó).
  if (silencio && completo && Date.now() <= deadline) await db.from("pub_cache").upsert({ key: "rfevb-arb-inicio", data: { at: new Date().toISOString() }, fetched_at: new Date().toISOString() });
  return { partidos: lista.length, completo, arbitros: suyos.size, filas, avisos, duplicados, silencio };
}
