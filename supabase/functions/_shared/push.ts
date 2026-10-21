// Envío de notificaciones (Web Push) a los dispositivos suscritos (tabla push_subs).
import webpush from "npm:web-push@3.6.7";

webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC")!, Deno.env.get("VAPID_PRIVATE")!);

export type Sub = { endpoint: string; p256dh: string; auth: string };
export type Msg = { title: string; body: string; tag?: string; url?: string };
// deno-lint-ignore no-explicit-any
type Db = any;

export async function send(db: Db, subs: Sub[], msg: Msg) {
  let ok = 0, gone = 0, fail = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 6 * 3600 });
      ok++; await db.from("push_subs").update({ last_sent: new Date().toISOString() }).eq("endpoint", s.endpoint);
    } catch (e) {
      // 404/410: el navegador ya no tiene esa suscripción (app desinstalada, permisos quitados): se borra.
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) { gone++; await db.from("push_subs").delete().eq("endpoint", s.endpoint); } else fail++;
    }
  }));
  return { ok, gone, fail };
}

// A todos los dispositivos de un árbitro (si no tiene ninguno, no hace nada).
export async function sendToUser(db: Db, userId: string, msg: Msg) {
  const { data } = await db.from("push_subs").select("endpoint, p256dh, auth").eq("user_id", userId);
  return data?.length ? await send(db, data, msg) : { ok: 0, gone: 0, fail: 0 };
}

export function madridNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", hour12: false })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { weekday: p.weekday, hour: +p.hour % 24 };
}

// "2026-10-24" → "sáb 24 oct"
export const shortDate = (ds: string) =>
  new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(ds + "T12:00:00Z")).replace(/[.,]/g, "");
export const cap = (s: string) => (s || "").toLowerCase().replace(/(^|[\s'-])\S/g, (c) => c.toUpperCase());
