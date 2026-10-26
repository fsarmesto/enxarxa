// Resultado publicado y acta subida de los partidos arbitrados (issue #31), de la web pública de resultados, sin login.
// - Resultado: el calendario público del equipo (teamMatches, caché 30 min compartida con Equipos), buscado por el
//   id_equipo local y, si no sale, por el visitante; vale cuando tiene marcador. Es lo mismo que el acta "rellena"
//   (voleibol_acta_completa.php sale con los sets cuando el resultado está metido en iSquad; comprobado en 81 partidos).
// - Acta subida: json/competicion/acta_escaneada.php?id_partido= devuelve la URL del PDF escaneado o null (80 bytes).
//   Es la foto del acta de papel: puede estar sin resultado y al revés.
// Los ids salen de la tabla de designaciones (parseDesignaciones). Una vez encontrado, no se vuelve a pedir.
import { PUB, teamMatches, UA, type Db } from "./publico.ts";

// Se miran los partidos empezados hace más de 1 h y de los últimos 30 días; como mucho MAX por pasada.
const DAYS = 30, MAX = 15, AFTER_MIN = 60;
// Hora de Madrid como texto "AAAA-MM-DD HH:MM" (las designaciones van en hora de Madrid).
const madridNow = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date());
const plusMin = (d: string, t: string, min: number) => new Date(Date.parse(`${d}T${t}:00Z`) + min * 6e4).toISOString().slice(0, 16).replace("T", " ");

export async function actaEscaneada(idPartido: string): Promise<string | null> {
  const r = await fetch(`${PUB}/json/competicion/acta_escaneada.php?id_partido=${encodeURIComponent(idPartido)}`,
    { headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest" }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`acta ${r.status}`); }
  const url = (await r.json())?.result;
  return typeof url === "string" && url ? url : null;
}
// Hora de subida: en la mayoría de actas el nombre del fichero es la hora en segundos Unix (uploads/actas/<id>/<s>.pdf).
const subidaDe = (url: string) => { const s = url.match(/\/(\d{10})\.pdf$/)?.[1]; return s ? new Date(+s * 1000).toISOString() : null; };

type Row = { id: string; date: string; time: string; teams: string; comp: string; estado: string | null; id_partido: string;
  eq_l: string | null; eq_v: string | null; res_l: number | null; acta_url: string | null };

export async function checkResultados(db: Db, userId: string, deadline: number): Promise<string> {
  const now = madridNow(), from = new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10);
  const { data } = await db.from("matches").select("id, date, time, teams, comp, estado, id_partido, eq_l, eq_v, res_l, acta_url")
    .eq("user_id", userId).not("id_partido", "is", null).gte("date", from).lte("date", now.slice(0, 10))
    .or("res_l.is.null,acta_url.is.null").order("date", { ascending: false });
  // Selecciones, suspendidos y aplazados: no publican resultado; nunca cuentan como pendientes.
  const todo = ((data || []) as Row[]).filter((m) => !/SELECCI/i.test(m.comp) && !/SUSPEND|APLAZ|ANULA/.test(m.estado || "")
    && now >= plusMin(m.date, m.time || "00:00", AFTER_MIN)).slice(0, MAX);
  let res = 0, actas = 0, errores = 0, fallo = "";
  for (const m of todo) {
    if (Date.now() > deadline - 15_000) break;
    const patch: Record<string, unknown> = { pub_checked: new Date().toISOString() };
    try {
      if (m.res_l == null) {
        const names = m.teams.split(" vs ");
        for (const [eq, name] of [[m.eq_l, names[0]], [m.eq_v, names[1]]]) {
          if (!eq || !name) continue;
          const p = (await teamMatches(db, eq, name)).find((x) => x.id === m.id_partido);
          if (p) { if (p.rl != null && p.rv != null) { patch.res_l = p.rl; patch.res_v = p.rv; patch.res_at = patch.pub_checked; res++; } break; }
        }
      }
      if (!m.acta_url) {
        const url = await actaEscaneada(m.id_partido);
        if (url) { patch.acta_url = url; patch.acta_at = subidaDe(url) ?? patch.pub_checked; actas++; }
      }
    } catch (e) { errores++; fallo ||= (e as Error).message; }
    await db.from("matches").update(patch).eq("user_id", userId).eq("id", m.id);
  }
  return `${todo.length} por mirar: ${res} resultados, ${actas} actas${errores ? `, ${errores} errores (${fallo})` : ""}`;
}
