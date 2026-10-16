// Cifrado AES-GCM de la contraseña de iSquad. La clave (CREDS_KEY, 32 bytes en base64)
// solo existe en los secrets de las funciones: la base de datos nunca ve la contraseña en claro.
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let keyP: Promise<CryptoKey> | null = null;
function key() {
  const raw = Deno.env.get("CREDS_KEY");
  if (!raw) throw new Error("Falta el secret CREDS_KEY");
  return keyP ??= crypto.subtle.importKey("raw", unb64(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encrypt(text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(text)));
  return b64(iv) + "." + b64(ct);
}
export async function decrypt(blob: string) {
  const [iv, ct] = blob.split(".").map(unb64);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await key(), ct));
}
