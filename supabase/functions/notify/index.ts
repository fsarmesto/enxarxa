// Notificaciones (Web Push).
// - Cron (x-cron-secret): recordatorio del domingo a las 20:00 de Madrid a todos los suscritos. El cron se lanza a
//   las 18 y a las 19 UTC (horario de verano e invierno) y aquí solo se envía si en Madrid son las 20.
//   Con {force:true} se envía ya (para probar).
// - Con la sesión del árbitro: {action:"subscribe", sub}, {action:"unsubscribe", endpoint}, {action:"test"}.
import { admin, cors, json, userFromRequest } from "../_shared/sync.ts";
import { madridNow, send, Sub } from "../_shared/push.ts";

const REMINDER = {
  title: "Liquidación arbitral",
  body: "¡No te olvides de subir los resultados y revisar tus cobros de dietas/kilometraje!",
  tag: "domingo",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  let body: { action?: string; sub?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; endpoint?: string; force?: boolean } = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }

  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") === secret) {
    const now = madridNow();
    if (!body.force && !(now.weekday === "Sun" && now.hour === 20)) return json({ skipped: true, madrid: now });
    // Solo árbitros: el recordatorio es de subir resultados y revisar cobros.
    const { data: deps } = await db.from("profiles").select("user_id").eq("tipo", "deportista");
    const skip = new Set((deps || []).map((d: { user_id: string }) => d.user_id));
    const subs: Sub[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from("push_subs").select("endpoint, p256dh, auth, user_id").range(from, from + 999);
      subs.push(...(data || []).filter((s: { user_id: string }) => !skip.has(s.user_id))); if (!data || data.length < 1000) break;
    }
    return json({ sent: await send(db, subs, REMINDER), madrid: now });
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
    return json({ ok: true, sent: await send(db, data, { ...REMINDER, title: "Prueba · Liquidación arbitral", tag: "prueba" }) });
  }
  return json({ error: "Acción no válida" }, 400);
});
