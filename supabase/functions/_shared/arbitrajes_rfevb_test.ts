// Con claves VAPID de prueba (push.ts las pide al cargarse): no se envía nada a nadie.
import webpush from "npm:web-push@3.6.7";
import { assertEquals } from "jsr:@std/assert@1.0.8";

const k = webpush.generateVAPIDKeys();
Deno.env.set("VAPID_SUBJECT", "mailto:prueba@example.com");
Deno.env.set("VAPID_PUBLIC", k.publicKey);
Deno.env.set("VAPID_PRIVATE", k.privateKey);
const { claveNombre } = await import("./arbitrajes_rfevb.ts");

Deno.test("árbitros de la RFEVB: el mismo nombre completo en cualquier orden, con o sin acentos y partículas", () => {
  assertEquals(claveNombre("ELVIRA CERDÁN, ALBERT"), claveNombre("ALBERT ELVIRA CERDAN"));
  assertEquals(claveNombre("MARIA DE LA O GARCIA LARA"), claveNombre("GARCIA LARA, MARIA O"));
  assertEquals(claveNombre("TP- ENRIQUE JAVIER ROMERO MARTINEZ"), claveNombre("ROMERO MARTINEZ, ENRIQUE JAVIER"));
  // Un apellido de menos ya no es la misma persona.
  if (claveNombre("ALBERT ELVIRA") === claveNombre("ALBERT ELVIRA CERDAN")) throw new Error("demasiado laxo");
});
