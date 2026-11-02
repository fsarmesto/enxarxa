import { assertEquals } from "jsr:@std/assert@1";
import { clasificaGrupo, comunes } from "./rfevb.ts";

Deno.test("RFEVB: nivel y género de cada competición", () => {
  assertEquals(clasificaGrupo("SUPERLIGA MASCULINA"), { nivel: "sl", genero: "M" });
  assertEquals(clasificaGrupo("LIGA IBERDROLA"), { nivel: "sl", genero: "F" });
  assertEquals(clasificaGrupo("SUPERLIGA MASCULINA 2"), { nivel: "sl2", genero: "M" });
  assertEquals(clasificaGrupo("SUPERLIGA FEMENINA 2"), { nivel: "sl2", genero: "F" });
  assertEquals(clasificaGrupo("PRIMERA DIVISION FEMENINA "), { nivel: "pn", genero: "F" });
  assertEquals(clasificaGrupo("TERCERA DIVISION SENIOR"), null);
});

Deno.test("RFEVB: palabras en común entre el nombre de iSquad y el de la RFEVB", () => {
  assertEquals(comunes("CV BENIDORM", "Komsol Benidorm"), 1);
  assertEquals(comunes("C.N. SABADELL", "Club Natació Sabadell"), 1);
  assertEquals(comunes("CV SANT CUGAT", "DSV Sant Cugat"), 2);
  assertEquals(comunes("CLUB VOLEIBOL", "CV Elche"), 0);   // solo palabras genéricas: no cuentan
});
