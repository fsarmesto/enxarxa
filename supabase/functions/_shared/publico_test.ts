// Pruebas de la lectura de la web pública de resultados (deno test -A supabase/functions/_shared/).
import { assertEquals } from "jsr:@std/assert@1.0.8";
import { clubId } from "./publico.ts";

Deno.test("id del club: del campo de iSquad o, si no viene, del escudo en el nombre", () => {
  assertEquals(clubId("123", ""), "123");
  const nombre = "<div class='nombres-equipos'><img width='50' src='https://voleibol.isquad.es/images/afiliacion_clubs/206572799/square_7667.jpg'></div> CV EXEMPLE 1</div>";
  assertEquals(clubId(undefined, nombre), "206572799");
  assertEquals(clubId(null, "CV EXEMPLE"), "");
});
