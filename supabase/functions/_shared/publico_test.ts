// Pruebas de la lectura de la web pública de resultados (deno test -A supabase/functions/_shared/).
import { assertEquals } from "jsr:@std/assert@1.0.8";
import { actaDeBotones, clubId } from "./publico.ts";

Deno.test("id del club: del campo de iSquad o, si no viene, del escudo en el nombre", () => {
  assertEquals(clubId("123", ""), "123");
  const nombre = "<div class='nombres-equipos'><img width='50' src='https://voleibol.isquad.es/images/afiliacion_clubs/206572799/square_7667.jpg'></div> CV EXEMPLE 1</div>";
  assertEquals(clubId(undefined, nombre), "206572799");
  assertEquals(clubId(null, "CV EXEMPLE"), "");
});

Deno.test("acta subida: de los botones del buscador de partidos", () => {
  const con = `<a href='#' onclick='mostrarActaFormal(70001, &quot;http:\\/\\/voleibol.isquad.es\\/\\/uploads\\/actas\\/70001\\/abc.pdf&quot;)'>`;
  assertEquals(actaDeBotones(con), "https://voleibol.isquad.es//uploads/actas/70001/abc.pdf");
  const doc = `onclick='mostrarActaFormal(70002, &quot;\\/\\/voleibol.isquad.es\\/partido_documento_publico.php?token=ab12&quot;)'`;
  assertEquals(actaDeBotones(doc), "https://voleibol.isquad.es/partido_documento_publico.php?token=ab12");
  assertEquals(actaDeBotones(`<div class="custom-col-circle disabled"></div>`), null);
});
