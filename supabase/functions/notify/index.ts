// Notificaciones (Web Push).
// - Cron (x-cron-secret): recordatorio del domingo a las 20:00 de Madrid a los árbitros suscritos, en su idioma. El cron se lanza a
//   las 18 y a las 19 UTC (horario de verano e invierno) y aquí solo se envía si en Madrid son las 20.
//   Con {force:true} se envía ya (para probar). Con {tipo:"resultados"}: aviso de resultados sin subir de la semana, el
//   domingo a las 21:00 (cron a las 19 y 20 UTC; ver avisoResultados).
// - Con la sesión del árbitro: {action:"subscribe", sub}, {action:"unsubscribe", endpoint}, {action:"test"}.
import { admin, cors, json, userFromRequest } from "../_shared/sync.ts";
import { langOf, madridNow, send, Sub } from "../_shared/push.ts";
import { lang, textos } from "../_shared/textos.ts";
import { avisoResultados } from "../_shared/resultados.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  let body: { action?: string; tipo?: string; sub?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; endpoint?: string; force?: boolean } = {};
  const deadline = Date.now() + 110_000;
  try { body = await req.json(); } catch { /* sin cuerpo */ }

  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") === secret) {
    const now = madridNow();
    // Resultados sin subir de la semana (issue #31): cron aparte, el domingo a las 21:00 de Madrid.
    if (body.tipo === "resultados") {
      if (!body.force && !(now.weekday === "Sun" && now.hour === 21)) return json({ skipped: true, madrid: now });
      return json({ resultados: await avisoResultados(db, deadline), madrid: now });
    }
    if (!body.force && !(now.weekday === "Sun" && now.hour === 20)) return json({ skipped: true, madrid: now });
    // Solo árbitros: el recordatorio es de revisar cobros. Cada uno en su idioma (profiles.lang).
    const { data: ps } = await db.from("profiles").select("user_id, tipo, lang");
    const info = new Map((ps || []).map((p: { user_id: string; tipo: string; lang: string | null }) => [p.user_id, p]));
    const porIdioma = { es: [] as Sub[], ca: [] as Sub[] };
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from("push_subs").select("endpoint, p256dh, auth, user_id").range(from, from + 999);
      for (const s of data || []) { const p = info.get(s.user_id); if (p && p.tipo !== "deportista") porIdioma[lang(p.lang)].push(s); }
      if (!data || data.length < 1000) break;
    }
    const sent = Object.fromEntries(await Promise.all((["es", "ca"] as const).map(async (l) =>
      [l, porIdioma[l].length ? await send(db, porIdioma[l], { ...textos(l).domingo(), tag: "domingo" }) : null])));
    return json({ sent, madrid: now });
  }

  const user = await userFromRequest(db, req);
  if (!user) return json({ error: "Inicia sesión de nuevo" }, 401);
  if (body.action === "subscribe") {
    const s = body.sub;
    if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth || !/^https:\/\//.test(s.endpoint)) return json({ error: "Suscripción no válida" }, 400);
    const { error } = await db.from("push_subs").upsert({ endpoint: s.endpoint, user_id: user.id, p256dh: s.keys.p256dh, auth: s.keys.auth });
    return error ? json({ error: "No se ha podido guardar" }, 500) : json({ ok: true });
  }
  if (body.action === "unsubscribe") {
    await db.from("push_subs").delete().eq("endpoint", body.endpoint || "").eq("user_id", user.id);
    return json({ ok: true });
  }
  if (body.action === "test") {
    const { data } = await db.from("push_subs").select("endpoint, p256dh, auth").eq("user_id", user.id);
    if (!data?.length) return json({ error: "Este usuario no tiene ningún dispositivo con el recordatorio activado" }, 404);
    return json({ ok: true, sent: await send(db, data, { ...textos(await langOf(db, user.id)).prueba(), tag: "prueba" }) });
  }
  return json({ error: "Acción no válida" }, 400);
});
