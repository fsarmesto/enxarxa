// Designaciones próximas de un árbitro desde su ficha pública (resultadosvoleibol.isquad.es/partidos_arbitro.php), sin
// login. Respaldo desde el 4-nov-2026: ese día iSquad empezó a responder 403 a nuestro servidor en el área privada
// (voleibol.isquad.es) y nadie podía entrar ni actualizarse. También sirve a las cuentas que damos de alta nosotros
// (sin contraseña de iSquad). Solo trae lo próximo: ni lo ya arbitrado ni los recibos (Cobros).
//
// La ficha, tal como llega (windows-1252):
//   <tr class='success'><th colspan=3>CAMPIONAT DE CATALUNYA 1a DIV. INF MASC - PRIMERA FASE GRUP A</th></tr>
//   <tr class='warning'><td>CN TERRASSA A - VA DE PEIX Arenys Vòlei</td><td>sábado 07 de noviembre a las 9:00</td>
//     <td><i-t page='common'>Pabellón</i-t>: PAVELLÓ VOLEIBOL CN TERRASSA  - Pista 1<br/>CARRER DELS JOCS ..., ESPAñA</td></tr>
//   <tr><td></td><td style='font-weight: bold;'>ARBITRO</td><td style='font-weight: bold;'>FERRAN SANCHIS ARMESTO</td></tr>
import { fixMojibake, norm, text, words, type Oficial } from "./publico.ts";
import type { Staff } from "./isquad.ts";

export type DesigPub = { comp: string; equipos: string; date: string; time: string; venue: string; addr: string; funcion: string };

const MESES: Record<string, number> = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
  GENER: 1, FEBRER: 2, MARC: 3, MAIG: 5, JUNY: 6, JULIOL: 7, AGOST: 8, SETEMBRE: 9, NOVEMBRE: 11, DESEMBRE: 12,   // en catalán
};

// "sábado 07 de noviembre a las 9:00" → 2026-11-07 09:00. El año no viene: el de la temporada (de agosto a julio).
export function fechaFicha(s: string, hoy = new Date()): { date: string; time: string } | null {
  const m = norm(s).match(/(\d{1,2})\s+(?:DE\s+|D')?([A-Z]+)(?:\s+(?:DE\s+)?(\d{4}))?.*?(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const mes = MESES[m[2]];
  if (!mes) return null;
  const y0 = hoy.getUTCMonth() + 1 >= 8 ? hoy.getUTCFullYear() : hoy.getUTCFullYear() - 1;   // año en que empieza la temporada
  const y = m[3] ? +m[3] : mes >= 8 ? y0 : y0 + 1;
  return { date: `${y}-${String(mes).padStart(2, "0")}-${m[1].padStart(2, "0")}`, time: `${m[4].padStart(2, "0")}:${m[5]}` };
}

// Las filas de la ficha. funcion: la del árbitro de la ficha en ese partido ("ARBITRO", "ANOTADOR"...).
export function parseFicha(html: string, hoy = new Date()): DesigPub[] {
  const out: DesigPub[] = [];
  let comp = "", cur: DesigPub | null = null;
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const celdas = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => c[1]);
    if (/class=['"]?success/i.test(tr)) { comp = text(fixMojibake(celdas[0] || "")); continue; }
    if (/class=['"]?warning/i.test(tr) && celdas.length >= 3) {
      const f = fechaFicha(text(celdas[1]), hoy);
      if (!f) { cur = null; continue; }
      const [pab, ...dir] = celdas[2].split(/<br\s*\/?>/i).map((p) => text(fixMojibake(p)));
      cur = { comp, equipos: text(fixMojibake(celdas[0])), ...f, venue: pab.replace(/^(Pabell[oó]n|Pavell[oó])\s*:\s*/i, "").replace(/\s+-\s+/g, " - ").trim(),
        addr: dir.join(", ").trim(), funcion: "" };
      out.push(cur);
      continue;
    }
    // Fila de la persona: celda vacía, función y nombre (solo la del propio árbitro).
    if (cur && celdas.length >= 3 && !text(celdas[0]) && !cur.funcion) cur.funcion = norm(text(celdas[1]));
  }
  return out;
}

// "L - V": los nombres de equipo también pueden llevar " - "; se prueban todos los cortes (el primero, el más probable).
export function cortesEquipos(s: string): [string, string][] {
  const partes = s.split(" - ");
  const out: [string, string][] = [];
  for (let i = 1; i < partes.length; i++) out.push([partes.slice(0, i).join(" - ").trim(), partes.slice(i).join(" - ").trim()]);
  return out;
}

// Rol y tipo de equipo arbitral (para la tarifa) del árbitro, con el Previo público del partido (matchOfficials). Sin
// Previo, solo lo que dice la ficha: ARBITRO → r1 (no se sabe si es el 1r o el 2n), ANOTADOR → an.
export function staffDe(oficiales: Oficial[], nombre: string, funcion: string): Staff {
  const mias = new Set(words(nombre));
  const soy = (n: string) => { const w = words(n); return w.length >= 2 && w.every((x) => mias.has(x)); };
  const refs = oficiales.filter((o) => o.f === "r1" || o.f === "r2"), an = oficiales.filter((o) => o.f === "an");
  const yo = oficiales.find((o) => soy(o.n));
  const role = (yo?.f === "r1" || yo?.f === "r2" || yo?.f === "an" || yo?.f === "jl") ? yo.f
    : /ANOTADOR/.test(funcion) ? "an" : /LINEA/.test(funcion) ? "jl" : "r1";
  const team = refs.length >= 2 ? (an.length ? "t3" : "t2a") : (an.length ? "t2b" : "t1");
  return { role, team, crew: oficiales.map((o) => ({ f: o.f, n: o.n, me: soy(o.n) })) };
}

// Clave estable de una designación sacada de la ficha cuando no se encuentra su partido público.
export const idSinPartido = (d: DesigPub) => `PUB-${d.date}-${d.time.replace(":", "")}-${norm(d.equipos).replace(/[^A-Z0-9]+/g, "").slice(0, 24)}`;
