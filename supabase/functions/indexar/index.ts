// Índice de plantillas de la web pública de resultados (cron, x-cron-secret). Cada pasada hace un trozo, con un
// presupuesto de páginas para no cargar iSquad (cada página ~1 MB):
// 1) fichas de club caducadas (14 días) → equipos de la temporada en curso a pub_teams;
// 2) plantillas sin revisar o caducadas (14 días) → huellas de cada persona a roster_idx.
// De cada persona solo se guarda la huella (HMAC con ROSTER_SALT) de su foto de afiliado y de su nombre, y su perfil.
import { admin, cors, json } from "../_shared/sync.ts";
import { clubs, clubTeams, huella, nameKey, roster } from "../_shared/publico.ts";

const PAGES_PER_RUN = 120;
const STALE = 14 * 24 * 3600_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "No autorizado" }, 401);
  const started = Date.now(), db = admin();
  const timeLeft = () => Date.now() - started < 100_000;
  let pages = 0, clubsDone = 0, teamsDone = 0, errors = 0;

  // 1) Clubs que el índice no ha repasado en 14 días (marca "idx:<id>" en pub_cache).
  const cl = await clubs(db);
  const { data: marks } = await db.from("pub_cache").select("key, fetched_at").like("key", "idx:%");
  const seen = new Map((marks || []).map((c: { key: string; fetched_at: string }) => [c.key.slice(4), new Date(c.fetched_at).getTime()]));
  const staleClubs = cl.filter((c) => !seen.has(c.id) || Date.now() - seen.get(c.id)! > STALE);
  for (const c of staleClubs) {
    if (pages >= PAGES_PER_RUN / 3 || !timeLeft()) break;
    try {
      if (seen.has(c.id)) await db.from("pub_cache").delete().eq("key", `club:${c.id}`); // ficha nueva al refrescar
      const teams = await clubTeams(db, c.id); pages++; clubsDone++;
      if (teams.length) {
        await db.from("pub_teams").upsert(teams.map((t) => ({ id_equipo: t.id, club_id: c.id, name: t.name, cat: t.cat })), { onConflict: "id_equipo" });
      }
      await db.from("pub_cache").upsert({ key: `idx:${c.id}`, data: { equipos: teams.length }, fetched_at: new Date().toISOString() });
    } catch { errors++; }
  }

  // 2) Plantillas: primero las nunca leídas, luego las más antiguas.
  const limit = Math.max(0, PAGES_PER_RUN - pages);
  const before = new Date(Date.now() - STALE).toISOString();
  const { data: todo } = await db.from("pub_teams").select("id_equipo").or(`checked_at.is.null,checked_at.lt.${before}`)
    .order("checked_at", { ascending: true, nullsFirst: true }).limit(limit);
  const queue = (todo || []).map((t: { id_equipo: string }) => t.id_equipo);
  const worker = async () => {
    while (queue.length && timeLeft()) {
      const id = queue.shift()!;
      try {
        const people = await roster(id); pages++;
        const rows = new Map<string, { id_equipo: string; h: string; perfil: string; con_foto: boolean }>();
        for (const p of people) {
          const con_foto = !!p.foto;
          if (p.foto) { const h = await huella("f", p.foto); rows.set(h, { id_equipo: id, h, perfil: p.perfil, con_foto }); }
          const k = nameKey(p.name);
          if (k) { const h = await huella("n", k); if (!rows.has(h) || !con_foto) rows.set(h, { id_equipo: id, h, perfil: p.perfil, con_foto }); }
        }
        await db.from("roster_idx").delete().eq("id_equipo", id);
        if (rows.size) await db.from("roster_idx").insert([...rows.values()]);
        await db.from("pub_teams").update({ checked_at: new Date().toISOString() }).eq("id_equipo", id);
        teamsDone++;
      } catch { errors++; }
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  const { count: total } = await db.from("pub_teams").select("id_equipo", { count: "exact", head: true });
  const { count: done } = await db.from("pub_teams").select("id_equipo", { count: "exact", head: true }).not("checked_at", "is", null);
  return json({ clubs: { total: cl.length, pendientes: staleClubs.length - clubsDone, leidos: clubsDone }, equipos: { total, revisados: done, ahora: teamsDone }, paginas: pages, errores: errors, ms: Date.now() - started });
});
