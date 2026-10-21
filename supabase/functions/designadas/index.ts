// Panel de administración: qué categorías tienen ya partidos designados el próximo fin de semana (toda la FCVB).
// Solo para los usuarios del secret ADMIN_LOGINS. Fuente pública: la ficha de "próximos partidos que arbitrará" de
// cada árbitro (partidos_arbitro.php, ~0,5 KB; la de toda la federación da error 500), cruzada con el listado de
// partidos de la federación para saber la categoría. Resultado en caché 1 h ({refresh:true} para forzarlo).
import { admin, cors, json, userFromRequest } from "../_shared/sync.ts";
import { cached, feed, fixMojibake, norm, PUB, TERRITORIAL } from "../_shared/publico.ts";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const MESES: Record<string, string> = { enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06", julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10", noviembre: "11", diciembre: "12" };
const txt = (s: string) => fixMojibake(s.replace(/<br\s*\/?>/gi, " · ").replace(/<[^>]+>/g, " ")).replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

async function getLatin(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest" }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`iSquad ${r.status}`); }
  return new TextDecoder("windows-1252").decode(await r.arrayBuffer());
}
// "domingo 25 de octubre a las 16:00" → "2026-10-25 16:00" (año: el de la fecha más cercana hacia delante).
function parseFecha(s: string) {
  const m = norm(s).match(/(\d{1,2}) DE ([A-Z]+) A LAS (\d{1,2}):(\d{2})/); if (!m) return "";
  const mm = MESES[m[2].toLowerCase()]; if (!mm) return "";
  const now = new Date(); let y = now.getFullYear();
  if (+mm < now.getMonth() + 1 - 6) y++;
  return `${y}-${mm}-${m[1].padStart(2, "0")} ${m[3].padStart(2, "0")}:${m[4]}`;
}

// Competición en catalán de iSquad → categoría del listado de partidos ("SEGUNDA DIVISION CADETE FEMENINO").
function compToCat(comp: string) {
  const c = norm(comp);
  const age = /\bSEN/.test(c) ? "SENIOR" : /\bJUN/.test(c) ? "JUNIOR" : /\bJUV/.test(c) ? "JUVENIL" : /\bCAD/.test(c) ? "CADETE" : /\bINF/.test(c) ? "INFANTIL" : /\bALEV/.test(c) ? "ALEVIN" : /AMATEUR/.test(c) ? "AMATEUR" : "";
  const gen = /\bFEM/.test(c) ? "FEMENINO" : /\bMASC/.test(c) ? "MASCULINO" : /\bMIXT/.test(c) ? "MIXTO" : "";
  const div = c.match(/\b(\d)A DIV/)?.[1];
  const divTxt = div ? ["", "PRIMERA", "SEGUNDA", "TERCERA", "CUARTA"][+div] + " DIVISION" : /PREFERENT/.test(c) ? "PREFERENTE" : "";
  if (age === "ALEVIN") return "ALEVIN";
  if (age === "AMATEUR") return `AMATEUR ${divTxt} ${gen}`.replace(/\s+/g, " ").trim();
  return age && divTxt ? `${divTxt} ${age} ${gen}`.replace(/\s+/g, " ").trim() : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const user = await userFromRequest(db, req);
  if (!user) return json({ error: "Inicia sesión de nuevo" }, 401);
  const admins = (Deno.env.get("ADMIN_LOGINS") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const { data: me } = await db.from("profiles").select("login_key").eq("user_id", user.id).maybeSingle();
  if (!me || !admins.includes(me.login_key)) return json({ error: "No disponible" }, 403);
  let body: { refresh?: boolean } = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }
  if (body.refresh) await db.from("pub_cache").delete().eq("key", "desig-global");

  const started = Date.now();
  const result = await cached(db, "desig-global", 3600_000, async () => {
    // Árbitros de la FCVB (ids de la lista pública), 7 días.
    const ids: string[] = await cached(db, "arbitros-ids", 7 * 24 * 3600_000, async () => {
      const s = await getLatin(`${PUB}/listado_arbitros.php?id_territorial=${TERRITORIAL}&id_superficie=1&seleccion=0`);
      return [...new Set([...s.matchAll(/partidosArbitro\((\d+)\)/g)].map((m) => m[1]))];
    });
    // Designaciones de cada árbitro, de 10 en 10.
    const desig = new Map<string, { d: string; teams: string; comp: string }>();
    let ok = 0, fail = 0;
    const queue = [...ids];
    const worker = async () => {
      while (queue.length && Date.now() - started < 110_000) {
        const id = queue.shift()!;
        try {
          const s = await getLatin(`${PUB}/partidos_arbitro.php?id_arbitro=${id}&id_superficie=1`); ok++;
          let comp = "";
          for (const tr of s.match(/<tr[\s\S]*?<\/tr>/g) || []) {
            const th = tr.match(/<th[^>]*>([\s\S]*?)<\/th>/); if (th) { comp = txt(th[1]).replace(/\s+-\s+(PRIMERA|SEGUNDA|TERCERA|FASE|FINAL|GRUP|GRUPO|LLIGA|JORNADA)[\s\S]*$/i, ""); continue; }
            if (!/class='warning'/.test(tr)) continue;
            const td = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => txt(x[1]));
            const d = parseFecha(td[1] || ""); if (!d) continue;
            desig.set(`${d}|${norm(td[0])}`, { d, teams: td[0], comp });
          }
        } catch { fail++; }
      }
    };
    await Promise.all(Array.from({ length: 10 }, worker));
    // Partidos de la federación de hoy al domingo que viene, por categoría (la del listado, con género).
    const now = new Date(), today = now.toISOString().slice(0, 10);
    const until = new Date(now.getTime() + ((7 - now.getUTCDay()) % 7) * 864e5).toISOString().slice(0, 10);
    const list = (await feed(db)).filter((p) => p.d.slice(0, 10) >= today && p.d.slice(0, 10) <= until);
    const cats = new Map<string, { cat: string; total: number; desig: number }>();
    const matched = new Set<string>();
    for (const p of list) {
      const c = cats.get(p.cat) || cats.set(p.cat, { cat: p.cat, total: 0, desig: 0 }).get(p.cat)!;
      c.total++;
      // El texto de la designación es "LOCAL - VISITANTE" (y los nombres pueden llevar guiones): por el local o el visitante.
      const key = [...desig.keys()].find((k) => { const x = desig.get(k)!; const t = norm(x.teams);
        return !matched.has(k) && x.d === p.d && (t.startsWith(norm(p.l) + " - ") || t.endsWith(" - " + norm(p.v))); });
      if (key) { c.desig++; matched.add(key); }
    }
    // Designaciones que no se han podido cruzar con su partido: a su categoría por el nombre de la competición
    // ("1a DIV. SEN MASC" → PRIMERA DIVISION SENIOR MASCULINO); si tampoco, a "otras".
    const otras = new Map<string, number>();
    for (const [k, x] of desig) {
      if (matched.has(k) || x.d.slice(0, 10) < today || x.d.slice(0, 10) > until) continue;
      const cat = compToCat(x.comp), c = cat && cats.get(cat);
      if (c && c.desig < c.total) c.desig++; else otras.set(x.comp, (otras.get(x.comp) || 0) + 1);
    }
    return {
      actualizado: new Date().toISOString(), desde: today, hasta: until, arbitros: ids.length, leidos: ok, errores: fail,
      designados: desig.size, partidos: list.length,
      categorias: [...cats.values()], otras: [...otras].map(([comp, n]) => ({ comp, n })),
    };
  });
  return json({ ok: true, ...result });
});
