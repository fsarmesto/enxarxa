// Login único de iSquad (4-nov-2026): la contraseña se envía UNA vez. iSquad simulado.
// npx -y deno@2.5.6 run --no-check -A tools/prueba-login-unico.ts
import { fetchDesignaciones, IsquadAuthError, loginDeportista } from "../supabase/functions/_shared/isquad.ts";
let posts = 0, ok = 0, mal = 0;
const check = (c: boolean, t: string) => { c ? ok++ : mal++; console.log(c ? "OK  " : "MAL ", t); };
const FORM = `<form method="post" action="loginunico.php" id="lu-form"><input type="hidden" name="csrf_token" value="abc">
  <input name="login"><input type="password" name="password"></form>
  <script>x.innerHTML='<div class="lu-alerta lu-alerta--error" role="alert"><span>No se ha podido cargar.</span></div>';</script>`;
let escenario = "";
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input)), cookie = new Headers(init?.headers).get("Cookie") || "";
  const r = (body: string, status = 200, h: Record<string, string> = {}) => new Response(body, { status, headers: h });
  if (url.pathname === "/loginunico.php" && init?.method === "POST") {
    posts++;
    const b = new URLSearchParams(String(init.body));
    if (b.get("csrf_token") !== "abc") return r("sin csrf", 400);
    if (escenario === "mala") return r(FORM + `<div class="lu-alerta lu-alerta--error" role="alert"><span class="ph"></span><span>Email o contraseña incorrectos. Te quedan 2 intentos antes de que se bloquee la cuenta.</span></div>`);
    if (escenario === "bloqueada") return r(FORM + `<div class="lu-alerta lu-alerta--error" role="alert"><span>Tu cuenta está bloqueada.</span></div>`);
    // Como iSquad el 4-nov-2026: vuelve a loginunico.php, que con sesión es "Tu área personal" (con ".lu2-paso" en los estilos)
    return r("", 302, { location: "/loginunico.php", "set-cookie": "PHPSESSID=s1; path=/" });
  }
  if (url.pathname === "/loginunico.php") {
    const area = url.searchParams.get("area");
    if (!area && cookie.includes("PHPSESSID=s1")) return r(`<style>.lu-login-neo .lu2-paso { x: 1 }</style><h2>Tu área personal</h2><a href="loginunico.php?area=arbitros">Árbitros</a>`);
    if (cookie.includes("PHPSESSID=s1") && area === "deportista" && escenario === "jugador")
      return r(`<div class="contact"><img src="/images/afiliacion/123/foto.jpg"><div class="contact-container">LAIA ESTEVE JUGADORA</div></div>`);
    if (cookie.includes("PHPSESSID=s1") && area === "entrenador" && escenario === "entrenador")
      return r(`<div class="contact"><img src="/images/afiliacion/9/e.jpg"><div class="contact-container">PAU MARTI ENTRENADOR</div></div>`);
    return r(FORM);
  }
  if (url.pathname === "/index.php") return r("<html>inicio</html>");
  if (url.pathname === "/arbitros_designaciones.php") return r("", 302, { location: "/loginunico.php?area=arbitros" });   // no es árbitro
  return r("", 404);
}) as typeof fetch;

for (const esc of ["mala", "bloqueada"]) {
  escenario = esc; posts = 0;
  const e = await fetchDesignaciones("x@y.es", "p").then(() => null, (e) => e);
  check(e instanceof IsquadAuthError && e.motivo === (esc === "mala" ? "rechazada" : "bloqueada") && !e.sesion && posts === 1,
    `${esc}: motivo ${e?.motivo}, sin sesión, ${posts} envío de la contraseña` + (e?.aviso ? ` · "${e.aviso}"` : ""));
}
for (const esc of ["jugador", "entrenador"]) {
  escenario = esc; posts = 0;
  const e = await fetchDesignaciones("x@y.es", "p").then(() => null, (e) => e);
  check(e instanceof IsquadAuthError && e.sesion.includes("PHPSESSID=s1"), `${esc}: no es árbitro y devuelve la sesión`);
  const d = await loginDeportista(e.sesion);
  check(d.area === esc && posts === 1, `${esc}: ${d.area} · ${d.nombre} · foto ${d.foto} · ${posts} envío de la contraseña en total`);
}
escenario = "nada"; posts = 0;
const e = await fetchDesignaciones("x@y.es", "p").then(() => null, (e) => e);
const d = await loginDeportista(e.sesion).then(() => null, (e) => e);
check(d instanceof IsquadAuthError && posts === 1, "ni árbitro ni jugador ni entrenador: error y 1 solo envío");
console.log(`${ok} OK, ${mal} MAL`); Deno.exit(mal ? 1 : 0);
