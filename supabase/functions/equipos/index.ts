// Equipos que sigue el árbitro (como jugador, entrenador o por interés) a partir de la web pública de resultados de
// iSquad (resultadosvoleibol.isquad.es, la que enlaza la FCVB). Con la sesión del árbitro:
// - {action:"buscar", q}: equipos de la federación por nombre de equipo o de club.
// - {action:"seguir", club_id, team, cat} / {action:"dejar", ...}: favoritos. Al seguir se mira la plantilla del
//   equipo y, si sale el árbitro, se guarda si es jugador o entrenador (de la plantilla no se guarda nada más).
// - {action:"activar", club_id, team, cat, activo}: un equipo seguido sale o no en "Mis partidos".
// - {action:"buscarme", club_id}: repasa las plantillas de todos los equipos de un club y sigue los que le incluyen.
// - {action:"clasificacion", torneo}: clasificación del grupo. {action:"historial", torneo, id_equipo, team}: partidos de
//   un equipo en ese grupo (jugados con resultado y por jugar).
// - {action:"mis"}: favoritos y sus próximos partidos. Antes, los equipos donde sale el árbitro según el índice de
//   plantillas (función indexar) se añaden solos (auto); los que quita no vuelven (oculto).
// Las páginas públicas pesan ~1 MB cada una (el menú): todo pasa por la caché compartida pub_cache.
import { admin, cors, json, userFromRequest } from "../_shared/sync.ts";
import { clubs, clubTeams, feed, standings, huella, matchOfficials, nameKey, norm, perfilOf, roleIn, sameCat, sameTeam, teamMatches, words } from "../_shared/publico.ts";


if (import.meta.main) Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  const db = admin();
  const user = await userFromRequest(db, req);
  if (!user) return json({ error: "Inicia sesión de nuevo" }, 401);
  let body: { action?: string; q?: string; club_id?: string; team?: string; cat?: string } = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }
  const { data: prof } = await db.from("profiles").select("nombre, foto").eq("user_id", user.id).maybeSingle();
  const me = words(prof?.nombre || ""), foto = prof?.foto || "";

  try {
    if (body.action === "buscar") {
      const q = norm(body.q || ""); if (q.length < 3) return json({ ok: true, equipos: [] });
      const [list, cl] = await Promise.all([feed(db), clubs(db)]);
      const clubName = new Map(cl.map((c) => [c.id, c.name]));
      const teams = new Map<string, { club_id: string; club: string; team: string; cat: string }>();
      for (const p of list) {
        for (const [name, cid] of [[p.l, p.cl], [p.v, p.cv]]) {
          const club = clubName.get(cid) || "";
          if (!norm(name).includes(q) && !norm(club).includes(q)) continue;
          const k = `${cid}|${norm(name)}|${norm(p.cat)}`;
          if (!teams.has(k)) teams.set(k, { club_id: cid, club, team: name, cat: p.cat });
        }
      }
      const out = [...teams.values()].sort((a, b) => a.club.localeCompare(b.club) || a.cat.localeCompare(b.cat) || a.team.localeCompare(b.team));
      // Clubs que coinciden (para "Búscame en este club").
      const cm = cl.filter((c) => norm(c.name).includes(q)).slice(0, 10);
      return json({ ok: true, equipos: out.slice(0, 60), clubs: cm });
    }

    if (body.action === "clasificacion" || body.action === "historial") {
      const b = body as { torneo?: string; id_equipo?: string; team?: string };
      if (!/^\d+$/.test(b.torneo || "")) return json({ error: "Grupo no válido" }, 400);
      if (body.action === "clasificacion") return json({ ok: true, filas: await standings(db, b.torneo!) });
      if (!/^\d+$/.test(b.id_equipo || "") || !b.team) return json({ error: "Equipo no válido" }, 400);
      const cal = await teamMatches(db, b.id_equipo!, b.team);
      return json({ ok: true, partidos: cal.filter((m) => m.tor === b.torneo) });
    }

    if (body.action === "activar") {
      const { club_id, team, cat } = body, activo = (body as { activo?: boolean }).activo !== false;
      if (!club_id || !team || !cat) return json({ error: "Faltan datos del equipo" }, 400);
      const { error } = await db.from("fav_teams").update({ activo }).eq("user_id", user.id).eq("club_id", club_id).eq("team", team).eq("cat", cat);
      return error ? json({ error: "No se ha podido guardar" }, 500) : json({ ok: true });
    }

    if (body.action === "seguir" || body.action === "dejar") {
      const { club_id, team, cat } = body;
      if (!club_id || !team || !cat) return json({ error: "Faltan datos del equipo" }, 400);
      if (body.action === "dejar") {
        // Los que añadió la app (sale en la plantilla) se ocultan en vez de borrarse, para no volver a añadirlos.
        await db.from("fav_teams").update({ oculto: true }).eq("user_id", user.id).eq("club_id", club_id).eq("team", team).eq("cat", cat).eq("auto", true);
        await db.from("fav_teams").delete().eq("user_id", user.id).eq("club_id", club_id).eq("team", team).eq("cat", cat).eq("auto", false);
        return json({ ok: true });
      }
      const [teamsOfClub, cl] = await Promise.all([clubTeams(db, club_id).catch(() => []), clubs(db).catch(() => [])]);
      const t = teamsOfClub.find((x) => sameTeam(x.name, team) && sameCat(x.cat, cat));
      const rol = t ? await roleIn(t.id, me, foto).catch(() => null) : null;
      const row = { user_id: user.id, club_id, team, cat, club: cl.find((c) => c.id === club_id)?.name || null, id_equipo: t?.id || null, rol, oculto: false };
      const { error } = await db.from("fav_teams").upsert(row);
      return error ? json({ error: "No se ha podido guardar" }, 500) : json({ ok: true, fav: row });
    }

    if (body.action === "buscarme") {
      const club_id = body.club_id || "";
      const [teamsOfClub, cl] = await Promise.all([clubTeams(db, club_id), clubs(db)]);
      if (!me.length) return json({ error: "Aún no sé tu nombre: pulsa Actualizar ahora y vuelve a probar" }, 409);
      const found: Record<string, unknown>[] = [];
      let i = 0, checked = 0;
      // De 4 en 4 y con hora límite (las funciones tienen ~150 s).
      const worker = async () => {
        while (i < teamsOfClub.length && Date.now() - started < 110_000) {
          const t = teamsOfClub[i++];
          const rol = await roleIn(t.id, me, foto).catch(() => null); checked++;
          if (rol) found.push({ user_id: user.id, club_id, team: t.name, cat: t.cat, club: cl.find((c) => c.id === club_id)?.name || null, id_equipo: t.id, rol });
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      if (found.length) await db.from("fav_teams").upsert(found);
      return json({ ok: true, found, checked, total: teamsOfClub.length });
    }

    if (body.action === "mis") {
      // Equipos donde sale según el índice de plantillas: por foto de afiliado o, si no, por nombre.
      const hf = foto ? await huella("f", foto) : "", hn = me.length ? await huella("n", nameKey(prof?.nombre || "")) : "";
      const hs = [hf, hn].filter(Boolean);
      let indexed = 0, total = 0;
      if (hs.length) {
        // Por foto, siempre. Por nombre, solo si esa persona de la plantilla no tiene foto (si tiene otra, es un homónimo).
        const { data: raw } = await db.from("roster_idx").select("id_equipo, h, perfil, con_foto").in("h", hs);
        const hits = (raw || []).filter((x: { h: string; con_foto: boolean }) => x.h === hf || !x.con_foto);
        const ids = [...new Set(hits.map((x: { id_equipo: string }) => x.id_equipo))];
        if (ids.length) {
          const { data: teams } = await db.from("pub_teams").select("id_equipo, club_id, name, cat").in("id_equipo", ids);
          const { data: have } = await db.from("fav_teams").select("club_id, team, cat").eq("user_id", user.id);
          const cl = await clubs(db).catch(() => []);
          const rows = (teams || []).filter((t: { club_id: string; name: string; cat: string }) =>
            !(have || []).some((h: { club_id: string; team: string; cat: string }) => h.club_id === t.club_id && sameTeam(h.team, t.name) && sameTeam(h.cat, t.cat)))
            .map((t: { id_equipo: string; club_id: string; name: string; cat: string }) => ({
              user_id: user.id, club_id: t.club_id, team: t.name, cat: t.cat, id_equipo: t.id_equipo, auto: true,
              club: cl.find((c) => c.id === t.club_id)?.name || null,
              rol: perfilOf(hits.find((x: { id_equipo: string }) => x.id_equipo === t.id_equipo)?.perfil || ""),
            }));
          if (rows.length) await db.from("fav_teams").upsert(rows, { ignoreDuplicates: true });
        }
      }
      { const r1 = await db.from("pub_teams").select("id_equipo", { count: "exact", head: true });
        const r2 = await db.from("pub_teams").select("id_equipo", { count: "exact", head: true }).not("checked_at", "is", null);
        total = r1.count || 0; indexed = r2.count || 0; }
      const { data: favs } = await db.from("fav_teams").select("club_id, team, cat, club, id_equipo, rol, auto, activo").eq("user_id", user.id).eq("oculto", false);
      const indice = { revisados: indexed, total };
      if (!favs?.length) return json({ ok: true, favs: [], partidos: [], indice });
      const list = await feed(db);
      const partidos = list.filter((p) => favs.some((f: { club_id: string; team: string; cat: string }) => sameCat(f.cat, p.cat) &&
        ((f.club_id === p.cl && sameTeam(f.team, p.l)) || (f.club_id === p.cv && sameTeam(f.team, p.v)))));
      // Calendario completo (jugados con resultado y por jugar) de los equipos con id; el pabellón, del listado.
      const calendario: Record<string, unknown[]> = {};
      await Promise.all(favs.filter((f: { id_equipo: string | null }) => f.id_equipo).map(async (f: { id_equipo: string; team: string }) => {
        try {
          const cal = await teamMatches(db, f.id_equipo, f.team);
          calendario[f.id_equipo] = cal.map((m) => {
            const fp = partidos.find((p) => p.d.slice(0, 10) === m.d && sameTeam(p.l, m.l) && sameTeam(p.v, m.v));
            return { ...m, pab: fp?.pab || "", pista: fp?.pista || "" };
          });
        } catch { /* sin calendario: la web usa el listado */ }
      }));
      // Equipo arbitral de los partidos de las 3 semanas de antes y de después (de los equipos activos), como mucho 16 por petición.
      const today = new Date(), dd = (n: number) => new Date(today.getTime() + n * 864e5).toISOString().slice(0, 10);
      const near: Record<string, unknown>[] = [];
      for (const f of favs as { id_equipo: string | null; activo: boolean }[]) {
        if (!f.id_equipo || f.activo === false) continue;
        for (const m of (calendario[f.id_equipo] || []) as Record<string, unknown>[]) {
          if ((m.d as string) >= dd(-21) && (m.d as string) <= dd(21) && !near.includes(m)) near.push(m);
        }
      }
      const queue = near.sort((a, b) => Math.abs(Date.parse(a.d as string) - today.getTime()) - Math.abs(Date.parse(b.d as string) - today.getTime())).slice(0, 16);
      const worker = async () => { for (let m; (m = queue.shift());) {
        try { m.arb = await matchOfficials(db, m.id as string, /FINALIZ/i.test(m.est as string)); } catch { /* sin árbitros */ }
      } };
      await Promise.all([worker(), worker(), worker(), worker()]);
      return json({ ok: true, favs, partidos, calendario, indice });
    }
  } catch (e) {
    return json({ error: "No se ha podido leer iSquad. Prueba en unos minutos.", detail: (e as Error).message }, 502);
  }
  return json({ error: "Acción no válida" }, 400);
});
