// Envío de notificaciones (Web Push) a los dispositivos suscritos (tabla push_subs).
import webpush from "npm:web-push@3.6.7";
import { lang, type Lang, textos, type Textos } from "./textos.ts";
export { cap } from "./textos.ts";

webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC")!, Deno.env.get("VAPID_PRIVATE")!);

export type Sub = { endpoint: string; p256dh: string; auth: string };
export type Msg = { title: string; body: string; tag?: string; url?: string };
// Aviso con los textos en el idioma de quien lo recibe (issue #36): se monta con su catálogo (_shared/textos.ts).
export type MsgFn = (t: Textos) => Msg;
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

// Idioma de los avisos de un usuario: el de su interfaz (profiles.lang, lo pone la web) o LANG_DEFECTO.
export async function langOf(db: Db, userId: string): Promise<Lang> {
  const { data } = await db.from("profiles").select("lang").eq("user_id", userId).maybeSingle();
  return lang(data?.lang);
}

// A todos los dispositivos de un usuario (si no tiene ninguno, no hace nada), en su idioma.
export async function sendToUser(db: Db, userId: string, msg: Msg | MsgFn) {
  const { data } = await db.from("push_subs").select("endpoint, p256dh, auth").eq("user_id", userId);
  if (!data?.length) return { ok: 0, gone: 0, fail: 0 };
  return await send(db, data, typeof msg === "function" ? msg(textos(await langOf(db, userId))) : msg);
}

export function madridNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", hour12: false })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { weekday: p.weekday, hour: +p.hour % 24 };
}

