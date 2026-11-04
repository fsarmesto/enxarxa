// Acta oficial de la FCVB (MODEL-ACTA-ESTANDARD, A4 apaisado) generada desde el acta electrónica (Ferran, 4-nov-2026).
// El fondo es el propio modelo de la FCVB convertido a SVG (fcvb/model-acta-estandard.svg: líneas, logos y textos tal cual)
// y los datos se escriben encima, colocados en puntos del PDF (841,92 × 595,32 pt = A4 apaisado; 1 pt del PDF = 1 pt CSS).
// Las coordenadas salen de las líneas y textos del PDF (pdftotext -bbox y las líneas del SVG).
// Paso 1: cabecera, plantillas, oficiales y árbitros. Los sets, sanciones y resultados vendrán en los pasos siguientes.
(() => {
'use strict';
const W = 841.92, H = 595.32;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TINTA = '#0b2a6f';   // azul de bolígrafo, como el acta a mano

// ---------- Utilidades de colocación ----------
// Texto dentro de una caja (x, y = arriba-izquierda; w, h en pt). Se encoge si no cabe.
function txt(x, y, w, h, t, o = {}) {
  if (t == null || t === '') return '';
  const s = String(t), fs = o.fs || Math.max(6.5, Math.min(h * 0.72, 9.5));
  // Ancho estimado (Arial): las mayúsculas y cifras ocupan más que las minúsculas.
  const ancho = [...s].reduce((t, c) => t + (/[A-ZÀ-ÖØ-Þ0-9]/.test(c) ? 0.68 : c === ' ' ? 0.28 : 0.52), 0) * fs;
  const k = ancho > w ? Math.max(0.55, w / ancho) : 1;      // estrecha el texto si es largo
  const al = o.al || 'left';
  return `<div class="f-t" style="left:${x}pt;top:${y}pt;width:${w}pt;height:${h}pt;font-size:${fs}pt;justify-content:${al === 'center' ? 'center' : al === 'right' ? 'flex-end' : 'flex-start'}${o.b ? ';font-weight:700' : ''}"><span style="transform:scaleX(${k.toFixed(3)});transform-origin:${al === 'right' ? 'right' : al === 'center' ? 'center' : 'left'} center">${esc(s)}</span></div>`;
}
const circulo = (cx, cy, r) => `<div class="f-c" style="left:${cx - r}pt;top:${cy - r}pt;width:${2 * r}pt;height:${2 * r}pt"></div>`;

// ---------- Nombres ----------
// "Ferran Sanchís Armesto" → "SANCHÍS ARMESTO, FERRAN" (se toma la primera palabra como nombre). Si ya viene con coma, se respeta.
function cognomNom(n) {
  const s = String(n || '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  if (s.includes(',')) return s.toUpperCase();
  const p = s.split(' ');
  return p.length < 2 ? s.toUpperCase() : `${p.slice(1).join(' ')}, ${p[0]}`.toUpperCase();
}
const fecha = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${+m[3]}/${+m[2]}/${m[1]}` : String(iso || ''); };

// ---------- Abreviatura del club (lista de la FCVB) ----------
const VACIAS = new Set(['CLUB', 'CV', 'C', 'V', 'CE', 'AE', 'AEE', 'AEEI', 'VOLEI', 'VOLEIBOL', 'VOLLEY', 'VOLEY', 'ASSOCIACIO', 'ASSOCIACION', 'ESPORTIU', 'ESPORTIVA', 'ESPORTIVA', 'DE', 'DEL', 'LA', 'EL', 'LES', 'ELS', 'L', 'D', 'I', 'Y', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'VERD', 'BLANC', 'NEGRE', 'GROC', 'BLAU', 'VERMELL', 'TARONJA', 'LILA', 'ROSA', 'JUNIOR', 'JUVENIL', 'CADET', 'INFANTIL', 'SENIOR', 'MASCULI', 'FEMENI']);
const fichas = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((x) => x && !VACIAS.has(x));
function abreviatura(nombre) {
  const f = fichas(nombre); if (!f.length) return '';
  let mejor = null, pm = 0, empate = false;
  for (const [club, codi] of window.ABREV_FCVB || []) {
    const c = fichas(club), p = f.filter((x) => c.includes(x)).length;
    if (p > pm) { mejor = codi; pm = p; empate = false; } else if (p === pm && p > 0 && codi !== mejor) empate = true;
  }
  return pm > 0 && !empate ? mejor : f[0].slice(0, 3);
}

// ---------- Geometría del modelo (pt) ----------
const G = {
  competicio: [70, 9, 305, 13], data: [407, 11, 72, 12], horaH: [512, 11, 20, 12], horaM: [537, 11, 22, 12],
  equipL: [64, 25, 214, 12], equipV: [337, 25, 222, 12], terreny: [91, 41, 465, 12],
  // Letras "A o B" impresas de cada equipo de la cabecera (centro), para rodear la buena con un círculo
  letraL: { A: [41.9, 31.5], B: [57.0, 31.5] }, letraV: { A: [314.5, 31.9], B: [329.3, 31.9] },
  // Plantillas: local a la izquierda, visitante a la derecha; 14 filas desde y = 336,8 de 12,07 pt
  fila0: 336.8, filaH: 12.07, filas: 14,
  colL: { num: [621.5, 13.2], nom: [634.7, 93.7] }, colV: { num: [728.4, 13.6], nom: [742.0, 93.5] },
  circL: [704.6, 321.1], circV: [752.2, 321.1], abrevL: [626, 315, 70, 12], abrevV: [761, 315, 70, 12],
  // Oficiales: 1r E, 2on, 2on, T/M (filas) · local a la izquierda y visitante a la derecha
  ofiFilas: [[511.6, 10], [521.6, 8.4], [530.0, 9.4], [539.4, 9.3]], ofiL: [624, 92], ofiV: [741, 93],
  // Árbitros: 1r AR, 2on AR, ANOT. (filas) · nombre y licencia
  arbFilas: [[493.9, 19.8], [513.7, 17.3], [531.0, 19.8]], arbNom: [158, 136], arbLic: [297, 49],
};

function pagina(A, ST, M) {
  const d = A.datos, e = ST.equipos, out = [];
  const eqA = ST.sets[0]?.izq || null;                       // equipo A = el de la izquierda del anotador en el set 1
  const letra = (eq) => (eqA ? (eq === eqA ? 'A' : 'B') : '');
  // Cabecera
  out.push(txt(...G.competicio, [d.competicion, d.categoria].filter(Boolean).join(' · ')));
  out.push(txt(...G.data, fecha(d.fecha)));
  const [hh, mm] = String(d.hora || '').split(':');
  out.push(txt(...G.horaH, hh || '', { al: 'right' }), txt(...G.horaM, mm || ''));
  out.push(txt(...G.equipL, d.local), txt(...G.equipV, d.visitante));
  if (eqA) { const l = G.letraL[letra('L')], v = G.letraV[letra('V')]; out.push(circulo(l[0], l[1], 5.2), circulo(v[0], v[1], 5.2)); }
  out.push(txt(...G.terreny, [d.pabellon, d.ciudad].filter(Boolean).join(' - ')));
  // Plantillas
  for (const [eq, col, circ, ab] of [['L', G.colL, G.circL, G.abrevL], ['V', G.colV, G.circV, G.abrevV]]) {
    out.push(txt(circ[0] - 4.5, circ[1] - 5.5, 9, 11, letra(eq), { al: 'center', b: true }));
    out.push(txt(...ab, d['abrev' + eq] || abreviatura(eq === 'L' ? d.local : d.visitante), { al: eq === 'L' ? 'right' : 'left', b: true }));
    const jug = [...e[eq].jugadores].sort((a, b) => (a.num === '00' ? -1 : +a.num) - (b.num === '00' ? -1 : +b.num));
    jug.slice(0, G.filas).forEach((j, i) => {
      const y = G.fila0 + i * G.filaH;
      out.push(txt(col.num[0], y, col.num[1], G.filaH, j.num, { al: 'center' }));
      if (j.cap) out.push(circulo(col.num[0] + col.num[1] / 2, y + G.filaH / 2, 5.4));
      const marcas = `${j.cat ? ` (${j.cat})` : ''}${j.lib ? ' (L)' : ''}`;
      const am = marcas ? marcas.trim().length * 4.4 + 2 : 0;   // sitio para (J) (L) al final del nombre
      out.push(txt(col.nom[0] + 2, y, col.nom[1] - 4 - am, G.filaH, cognomNom(j.nombre)));
      if (marcas) out.push(txt(col.nom[0] + col.nom[1] - 2 - am, y, am, G.filaH, marcas.trim(), { al: 'right' }));
    });
    // Oficiales: 1r E = entrenador; 2on = entrenadores asistentes; T/M = fisioterapeuta o médico
    const of = (rol) => e[eq].oficiales.find((o) => o.rol === rol && o.nombre)?.nombre || '';
    const tm = [of('F'), of('M')].filter(Boolean).map(cognomNom).join(' / ');
    [of('E'), of('E2'), of('E3')].map(cognomNom).concat([tm]).forEach((n, i) => {
      const [y, h] = G.ofiFilas[i], [x, w] = eq === 'L' ? G.ofiL : G.ofiV;
      out.push(txt(x, y, w, h, n));
    });
  }
  // Árbitros
  [[d.r1, d.r1Lic], [d.r2, d.r2Lic], [d.an, d.anLic]].forEach(([n, lic], i) => {
    const [y, h] = G.arbFilas[i];
    out.push(txt(G.arbNom[0], y, G.arbNom[1], h, cognomNom(n)), txt(G.arbLic[0], y + (i === 0 ? 5 : 0), G.arbLic[1], h - (i === 0 ? 5 : 0), lic, { al: 'center' })   /* la 1ª fila lleva el rótulo LLICÈNCIA arriba */);
  });
  return `<div class="fcvb-pagina" data-noi18n style="color:${TINTA}"><img class="fcvb-fondo" src="fcvb/model-acta-estandard.svg" alt="">${out.join('')}</div>`;
}

window.ActaFcvb = { pagina, abreviatura, cognomNom, W, H };
})();
