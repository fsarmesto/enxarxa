// Calendario del usuario en formato iCal, para suscribirse desde Google Calendar o el calendario del iPhone.
// - GET ?t=<token>: el calendario (arbitrajes + partidos de los equipos activos en "Mis partidos"). Sin sesión: el
//   token secreto es la llave (los calendarios no pueden iniciar sesión).
// - POST con la sesión {action:"url"} / {action:"nuevo"}: el enlace (lo crea si no existe) / uno nuevo (el viejo deja de valer).
import { admin, cors, json, userFromRequest } from "../_shared/sync.ts";
import { feed, norm, teamMatches } from "../_shared/publico.ts";

// Texto de iCal (RFC 5545): barra, punto y coma y coma escapados; cualquier salto de línea, como \n.
const esc = (s: string) => (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
const cap = (s: string) => (s || "").toLowerCase().replace(/(^|[\s'-])\S/g, (c) => c.toUpperCase());
// Líneas de más de 75 octetos se parten (RFC 5545).
function fold(line: string) {
  const out: string[] = []; let cur = "", n = 0;
  for (const ch of line) { const b = new TextEncoder().encode(ch).length; if (n + b > 74) { out.push(cur); cur = " "; n = 1; } cur += ch; n += b; }
  return [...out, cur].join("\r\n");
}
const dt = (d: string, t: string) => `${d.replace(/-/g, "")}T${t.replace(":", "")}00`;
const plus = (d: string, t: string, min: number) => { const x = new Date(`${d}T${t}:00Z`); x.setUTCMinutes(x.getUTCMinutes() + min); return x.toISOString().slice(0, 16).replace("T", " "); };
const ROL: Record<string, string> = { r1: "1r árbitro", r2: "2n árbitro", an: "Anotador", jl: "Juez de línea" };
const TZ = ["BEGIN:VTIMEZONE", "TZID:Europe/Madrid", "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT", "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD", "END:VTIMEZONE"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const url = new URL(req.url);
  if (req.method === "GET") {
    const t = url.searchParams.get("t") || "";
    if (!/^[a-f0-9]{32}$/.test(t)) return new Response("Enlace no válido", { status: 404 });
    const { data: p } = await db.from("profiles").select("user_id").eq("cal_token", t).maybeSingle();
    if (!p) return new Response("Enlace no válido", { status: 404 });
    return new Response(await ics(db, p.user_id), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "max-age=1800" } });
  }
  const user = await userFromRequest(db, req);
  if (!user) return json({ error: "Inicia sesión de nuevo" }, 401);
  let body: { action?: string } = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }
  const { data: prof } = await db.from("profiles").select("cal_token").eq("user_id", user.id).maybeSingle();
  let token = prof?.cal_token;
  if (!token || body.action === "nuevo") {
    token = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await db.from("profiles").update({ cal_token: token }).eq("user_id", user.id);
  }
  return json({ ok: true, url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/calendario?t=${token}` });
});

// deno-lint-ignore no-explicit-any
async function ics(db: any, userId: string) {
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const ev: string[][] = [];
  const event = (uid: string, start: string[], summary: string, location: string, description: string) =>
    ev.push(["BEGIN:VEVENT", `UID:${uid}@liquidacion-arbitral-fcvb`, `DTSTAMP:${stamp}`, ...start, `SUMMARY:${esc(summary)}`, ...(location ? [`LOCATION:${esc(location)}`] : []),
      ...(description ? [`DESCRIPTION:${esc(description)}`] : []), "END:VEVENT"]);
  // Arbitrajes
  const { data: ms } = await db.from("matches").select("id, date, time, comp, teams, venue, addr, role, staff_checked, crew").eq("user_id", userId).gte("date", since).not("comp", "ilike", "%SELECCI%");
  for (const m of ms || []) {
    const crew = Array.isArray(m.crew) ? m.crew.map((c: { f: string; n: string; me: boolean }) => `${ROL[c.f] || c.f}: ${c.me ? "Tú" : cap(c.n)}`).join("\n") : "";
    event(`arb-${m.id}`, [`DTSTART;TZID=Europe/Madrid:${dt(m.date, m.time)}`, `DTEND;TZID=Europe/Madrid:${dt(...(plus(m.date, m.time, 120).split(" ") as [string, string]))}`],
      `🟨 ${cap(m.teams)}${m.staff_checked && ROL[m.role] ? ` (${ROL[m.role]})` : ""}`, [m.venue, m.addr].filter(Boolean).join(", "), `${cap(m.comp)}\n${crew}`.trim());
  }
  // Partidos de mis equipos (activos en "Mis partidos")
  const { data: favs } = await db.from("fav_teams").select("id_equipo, team, cat, rol, club_id").eq("user_id", userId).eq("activo", true).eq("oculto", false).not("id_equipo", "is", null);
  const list = favs?.length ? await feed(db).catch(() => []) : [];
  const seen = new Set<string>();
  for (const f of favs || []) {
    let cal; try { cal = await teamMatches(db, f.id_equipo, f.team); } catch { continue; }
    for (const m of cal) {
      if (m.d < since || seen.has(m.id) || !m.d) continue; seen.add(m.id);
      const fp = list.find((p) => p.d.slice(0, 10) === m.d && norm(p.l) === norm(m.l) && norm(p.v) === norm(m.v));
      const who = f.rol === "entrenador" ? "Entrenas" : f.rol ? "Juegas" : "Sigues";
      const res = /FINALIZ/i.test(m.est) && m.rl != null ? ` (${m.rl}-${m.rv})` : /SUSPEN|APLAZ/i.test(m.est) ? ` (${m.est.toLowerCase()})` : "";
      const start = m.t ? [`DTSTART;TZID=Europe/Madrid:${dt(m.d, m.t)}`, `DTEND;TZID=Europe/Madrid:${dt(...(plus(m.d, m.t, 120).split(" ") as [string, string]))}`]
        : [`DTSTART;VALUE=DATE:${m.d.replace(/-/g, "")}`];
      event(`eq-${m.id}`, start, `🏐 ${cap(m.l)} – ${cap(m.v)}${res}${m.t && !m.conf ? " (hora provisional)" : m.t ? "" : " (hora por confirmar)"}`,
        cap(fp?.pab || ""), `${who} con ${cap(f.team)} · ${cap(m.comp)}${m.j ? ` · Jornada ${m.j}` : ""}`);
    }
  }
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Liquidacion arbitral FCVB//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Vòlei EnXarxa", "X-WR-TIMEZONE:Europe/Madrid", "REFRESH-INTERVAL;VALUE=DURATION:PT3H", "X-PUBLISHED-TTL:PT3H",
    ...TZ, ...ev.flat(), "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
}
