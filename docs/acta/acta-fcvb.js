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
// Raya de (x1,y1) a (x2,y2): para tachar numeritos, la X, la S/R y el reloj de arena.
function raya(x1, y1, x2, y2, g = 0.8) {
  const l = Math.hypot(x2 - x1, y2 - y1), a = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  return `<div class="f-r" style="left:${x1}pt;top:${y1 - g / 2}pt;width:${l}pt;border-top-width:${g}pt;transform:rotate(${a.toFixed(2)}deg)"></div>`;
}
const cruz = (x, y, w, h) => raya(x + 1.5, y + 1.5, x + w - 1.5, y + h - 1.5) + raya(x + w - 1.5, y + 1.5, x + 1.5, y + h - 1.5);
// Reloj de arena sobre los puntos que sobran de una columna (de y1 a y2, entre x1 y x2).
const reloj = (x1, y1, x2, y2) => raya(x1, y1, x2, y1) + raya(x1, y2, x2, y2) + raya(x1, y1, x2, y2) + raya(x2, y1, x1, y2);
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '');
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
// Inscripción de jugadores (Ferran): solo el primer apellido, "Sanchís"; si dos del equipo coinciden, con la inicial: "Pinto, G."
const apellido = (n) => { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? p[1] : p[0] || ''; };
function apellidos(jugadores) {
  const cuenta = {}; jugadores.forEach((j) => { const a = apellido(j.nombre).toLowerCase(); cuenta[a] = (cuenta[a] || 0) + 1; });
  return (j) => { const a = apellido(j.nombre); return cuenta[a.toLowerCase()] > 1 ? `${a}, ${String(j.nombre).trim()[0] || ''}.` : a; };
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

// ---------- Sets 1 a 4 ----------
// Set 1 (arriba izquierda) medido en el PDF; el 2 está +414,3 pt a la derecha, el 3 +129,7 pt abajo y el 4 las dos cosas.
// En cada set, la mitad derecha está +196,1 pt (mismas columnas). Sets 1 y 3: "EQUIP A" a la izquierda; 2 y 4: "EQUIP B".
const SET = {
  off: { 1: [0, 0], 2: [414.3, 0], 3: [0, 129.7], 4: [414.3, 129.7] }, mitad: 196.1,
  col: [29.8, 58.1, 85.8, 113.2, 141.2, 169.0, 195.9],          // bordes de las columnas I..VI (mitad izquierda)
  sub: [44.3, 72.0, 99.7, 127.4, 155.1, 182.8],                 // separación de las 2 subcolumnas de saque
  fila: { cab: 53.2, rom: 66.2, alin: 79.1, entra: 92.2, mEntra: 105.1, mVuelve: 118.1, saque: 131.0, fin: 182.8 }, saqueH: 12.95,
  puntsX: [200.65, 209.75, 219.75], puntsY0: 70.75, puntsPaso: [5.77, 6.28, 6.28], puntsCol: [195.9, 225.9],
  T: [[156.9, 12.9], [169.8, 13.0]],                            // 2 filas de tiempos de descanso bajo la "T"
  inici: [31, 63.6], final: [338.5, 371.4], abrev: [[120, 64], [262, 63]], sr: [[185, 195.9], [326.4, 337.2]], min: [8.5, 166, 21.3, 16.5],
};
const COLS_PUNTS = [[1, 13], [14, 25], [26, 37]];
function setBloque(st, s, eqIzq, out) {
  const [dx, dy] = SET.off[s.n], eqs = [eqIzq, eqIzq === 'L' ? 'V' : 'L'];
  // Hora de inicio (mitad izquierda) y de final (mitad derecha), separadas por los ":" impresos
  const hhmm = (iso, [xl, xc]) => { const [h, m] = hora(iso).split(':'); return h ? txt(dx + xl + 15, dy + SET.fila.cab, xc - xl - 16, 13, h, { al: 'right' }) + txt(dx + xc + 2.5, dy + SET.fila.cab, 16, 13, m) : ''; };
  out.push(hhmm(s.inicio, SET.inici), hhmm(s.fin, SET.final));
  if (s.inicio && s.fin) out.push(txt(dx + SET.min[0], dy + SET.min[1], SET.min[2], SET.min[3], String(Math.round((Date.parse(s.fin) - Date.parse(s.inicio)) / 60000)), { al: 'center' }));
  eqs.forEach((eq, k) => {
    const mx = dx + k * SET.mitad, rival = eqs[1 - k];
    const abrev = st.__abrev[eq];
    out.push(txt(dx + SET.abrev[k][0], dy + SET.fila.cab, SET.abrev[k][1], 13, abrev, { b: true }));
    // S/R: se tacha la que toca (S el que saca primero)
    const [sx1, sx2] = SET.sr[k], saca = s.saqueInicial === eq, yS = dy + SET.fila.cab;
    out.push(saca ? raya(dx + sx1 + 1, yS + 1, dx + sx2 - 1, yS + 6) : raya(dx + sx1 + 1, yS + 7.5, dx + sx2 - 1, yS + 12.5));
    const al = s.alineacion[eq] || [];
    for (let i = 0; i < 6; i++) {
      const x = mx + SET.col[i], w = SET.col[i + 1] - SET.col[i], t = al[i];
      out.push(txt(x, dy + SET.fila.alin, w, 13, t, { al: 'center', fs: 9 }));
      // Sustitución (no las excepcionales, que van a observaciones): quién entra, marcador al entrar y al volver
      const entra = s.sust[eq].find((x) => x.sale === t && x.tipo !== 'excepcional');
      if (entra) {
        out.push(txt(x, dy + SET.fila.entra, w, 13, entra.entra, { al: 'center', fs: 9 }));
        out.push(txt(x, dy + SET.fila.mEntra, w, 13, `${entra.a}:${entra.b}`, { al: 'center', fs: 7.5 }));
        const vuelve = s.sust[eq].find((x) => x.entra === t && x.sale === entra.entra && x.tipo !== 'excepcional');
        if (vuelve) out.push(txt(x, dy + SET.fila.mVuelve, w, 13, `${vuelve.a}:${vuelve.b}`, { al: 'center', fs: 7.5 }));
      }
    }
    // Turnos de saque: casilla k de la columna (1-4 a la izquierda, 5-8 a la derecha); el que recibe, X en la 1ª de la I
    const usadas = [0, 0, 0, 0, 0, 0];
    const casilla = (c) => { const n = usadas[c]++; if (n >= 8) return null; const izq = n < 4, f = n % 4;
      return { x: mx + (izq ? SET.col[c] : SET.sub[c]), x2: mx + (izq ? SET.sub[c] : SET.col[c + 1]), y: dy + SET.fila.saque + f * SET.saqueH }; };
    if (s.saqueInicial && s.saqueInicial !== eq) { const c = casilla(0); out.push(cruz(c.x, c.y, c.x2 - c.x, SET.saqueH)); }
    const turnos = s.turnos[eq];
    turnos.forEach((tu, i) => {
      if (tu.hasta == null || tu.col < 0) return;
      const c = casilla(tu.col); if (!c) return;
      const w = c.x2 - c.x, ultimo = i === turnos.length - 1 && s.fin;
      out.push(txt(c.x + 0.5, c.y + 0.5, w - 4, SET.saqueH - 1, tu.hasta, { fs: 8.5 }));
      out.push(raya(c.x2 - 3.6, c.y + SET.saqueH - 1.2, c.x2 - 0.6, c.y + 8.2, 0.7));                // tacha el numerito impreso
      if (ultimo) out.push(circulo(c.x + w / 2 - 1.5, c.y + SET.saqueH / 2, 5.6));                   // marcador final del set
    });
    // PUNTS: "/" en cada punto (círculo si es de castigo) y reloj de arena en lo que sobra de cada columna
    const px = dx + k * SET.mitad, prog = s.progreso.filter((x) => x.eq === eq && !x.anulado);
    const pos = (n) => { const c = n <= 13 ? 0 : n <= 25 ? 1 : 2, i = n - COLS_PUNTS[c][0]; return [px + SET.puntsX[c], dy + SET.puntsY0 + i * SET.puntsPaso[c], c]; };
    prog.forEach((p, i) => { if (i >= 37) return; const [x, y] = pos(i + 1);
      out.push(/castigo/i.test(p.motivo) ? circulo(x, y, 3.3) : raya(x - 2.6, y + 2.4, x + 2.6, y - 2.4, 0.7)); });
    if (s.fin) COLS_PUNTS.forEach(([a, b], c) => {
      const desde = Math.max(a, prog.length + 1); if (desde > b) return;
      const [, y1] = pos(desde), [, y2] = pos(b), x1 = px + SET.puntsCol[0] + 1 + (c === 0 ? 0 : c === 1 ? 9.8 : 19.4), x2 = x1 + (c === 0 ? 8.6 : 9);
      out.push(reloj(x1, y1 - 3, x2, y2 + 3));
    });
    // Tiempos de descanso: marcador propio:rival
    s.tiempos[eq].slice(0, 2).forEach((t, i) => out.push(txt(px + SET.puntsCol[0], dy + SET.T[i][0], 30, SET.T[i][1], `${t.a}:${t.b}`, { al: 'center', fs: 8.5 })));
  });
}

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
    const ape = apellidos(e[eq].jugadores);
    const jug = [...e[eq].jugadores].sort((a, b) => (a.num === '00' ? -1 : +a.num) - (b.num === '00' ? -1 : +b.num));
    jug.slice(0, G.filas).forEach((j, i) => {
      const y = G.fila0 + i * G.filaH;
      out.push(txt(col.num[0], y, col.num[1], G.filaH, j.num, { al: 'center' }));
      if (j.cap) out.push(circulo(col.num[0] + col.num[1] / 2, y + G.filaH / 2, 5.4));
      const marcas = `${j.cat ? ` (${j.cat})` : ''}${j.lib ? ' (L)' : ''}`;
      const am = marcas ? marcas.trim().length * 4.4 + 2 : 0;   // sitio para (J) (L) al final del nombre
      out.push(txt(col.nom[0] + 2, y, col.nom[1] - 4 - am, G.filaH, ape(j)));
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
  // Sets 1 a 4 (el 5 va en el paso siguiente). Equipo de la mitad izquierda: A en los sets 1 y 3, B en los 2 y 4.
  ST.__abrev = { L: d.abrevL || abreviatura(d.local), V: d.abrevV || abreviatura(d.visitante) };
  if (eqA) for (const s of ST.sets) if (s.inicio && s.n <= 4 && !s.golden) setBloque(ST, s, s.n % 2 ? eqA : (eqA === 'L' ? 'V' : 'L'), out);
  return `<div class="fcvb-pagina" data-noi18n style="color:${TINTA}"><img class="fcvb-fondo" src="fcvb/model-acta-estandard.svg" alt="">${out.join('')}</div>`;
}

window.ActaFcvb = { pagina, abreviatura, cognomNom, W, H };
})();
