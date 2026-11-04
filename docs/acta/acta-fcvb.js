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
// Ancho estimado de un texto (Arial): las mayúsculas y cifras ocupan más que las minúsculas.
const anchoTexto = (s, fs) => [...String(s)].reduce((t, c) => t + (/[A-ZÀ-ÖØ-Þ0-9]/.test(c) ? 0.68 : c === ' ' ? 0.28 : 0.52), 0) * fs;
// Reparte un texto en líneas de ancho máximo `w` (pt).
function enLineas(texto, w, fs) {
  const out = []; let l = '';
  for (const p of String(texto).split(/\s+/).filter(Boolean)) { const c = l ? l + ' ' + p : p; if (anchoTexto(c, fs) <= w || !l) l = c; else { out.push(l); l = p; } }
  if (l) out.push(l); return out;
}
// Texto dentro de una caja (x, y = arriba-izquierda; w, h en pt). Se encoge si no cabe.
function txt(x, y, w, h, t, o = {}) {
  if (t == null || t === '') return '';
  const s = String(t), fs = o.fs || Math.max(6.5, Math.min(h * 0.72, 9.5));
  const ancho = anchoTexto(s, fs);
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
// Texto apoyado en la línea base `base` (pt), como la letra impresa del rótulo o encima de un renglón. Con line-height 1,
// la línea base de Arial queda a 0,8465 × tamaño desde arriba.
function linea(x, base, w, t, o = {}) { const fs = o.fs || 9.5; return txt(x, base - 0.8465 * fs, w, fs, t, { ...o, fs }); }
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
// Una mitad de set (o una parte del set 5) para un equipo. `o`: dónde (columnas, filas, PUNTS, T) y qué (formación,
// sustituciones, turnos, puntos, tiempos). Las sustituciones excepcionales no se escriben aquí (van a observaciones).
function mitad(o, out) {
  const { cols, subs, y, al } = o;
  for (let i = 0; i < 6; i++) {
    const x = cols[i], w = cols[i + 1] - cols[i], t = al[i];
    out.push(txt(x, y.alin, w, 13, t, { al: 'center', fs: 9 }));
    const entra = o.sust.find((z) => z.sale === t && z.tipo !== 'excepcional');
    if (!entra) continue;
    out.push(txt(x, y.entra, w, 13, entra.entra, { al: 'center', fs: 9 }), txt(x, y.mEntra, w, 13, `${entra.a}:${entra.b}`, { al: 'center', fs: 7.5 }));
    const vuelve = o.sust.find((z) => z.entra === t && z.sale === entra.entra && z.tipo !== 'excepcional');
    if (vuelve) out.push(txt(x, y.mVuelve, w, 13, `${vuelve.a}:${vuelve.b}`, { al: 'center', fs: 7.5 }));
  }
  // Turnos de saque: casilla siguiente de la columna (1-4 a la izquierda, 5-8 a la derecha)
  const usadas = [0, 0, 0, 0, 0, 0];
  const casilla = (c) => { const n = usadas[c]++; if (n >= 8) return null; const izq = n < 4, f = n % 4;
    return { x: izq ? cols[c] : subs[c], x2: izq ? subs[c] : cols[c + 1], y: y.saque + f * SET.saqueH }; };
  const tacha = (c) => raya(c.x2 - 3.6, c.y + SET.saqueH - 1.2, c.x2 - 0.6, c.y + 8.2, 0.7);
  if (o.x) { const c = casilla(0); out.push(cruz(c.x, c.y, c.x2 - c.x, SET.saqueH)); }
  o.turnos.forEach((tu, i) => {
    if (tu.col < 0) return;
    const c = casilla(tu.col); if (!c) return;
    if (tu.abierto) { out.push(tacha(c)); return; }   // set 5: el turno que va en curso al cambiar se deja abierto
    if (tu.hasta == null) return;
    const w = c.x2 - c.x;
    out.push(txt(c.x + 0.5, c.y + 0.5, w - 4, SET.saqueH - 1, tu.hasta, { fs: 8.5 }), tacha(c));
    if (o.final && i === o.turnos.length - 1) out.push(circulo(c.x + w / 2 - 1.5, c.y + SET.saqueH / 2, 5.6));
  });
  // PUNTS: "/" en cada punto (círculo si es de castigo); reloj de arena en lo que sobra de cada columna
  o.puntos.forEach((p) => { const q = o.punto(p.n); if (!q) return; const [x, yy] = q;
    out.push(/castigo/i.test(p.motivo) ? circulo(x, yy, 3.3) : raya(x - 2.6, yy + 2.4, x + 2.6, yy - 2.4, 0.7)); });
  if (o.reloj) for (const [a, b, x1, x2] of o.reloj) {
    const desde = Math.max(a, o.total + 1); if (desde > b) continue;
    out.push(reloj(x1, o.punto(desde)[1] - 3, x2, o.punto(b)[1] + 3));
  }
  o.tiempos.slice(0, 2).forEach((t, i) => out.push(txt(o.T[i][0], o.T[i][1], 30, o.T[i][2], `${t.a}:${t.b}`, { al: 'center', fs: 8.5 })));
}
// PUNTS normal (1-13, 14-25, 26-37) de una mitad cuyo "1" está en (x0, y0)
function puntsNormal(x0, y0) {
  const X = [x0, x0 + 9.1, x0 + 19.1], paso = [5.77, 6.28, 6.28];
  const punto = (n) => { if (n < 1 || n > 37) return null; const c = n <= 13 ? 0 : n <= 25 ? 1 : 2, i = n - COLS_PUNTS[c][0]; return [X[c], y0 + i * paso[c]]; };
  const xc = x0 - 4.75;   // borde izquierdo de la columna PUNTS
  return { punto, reloj: [[1, 13, xc + 1, xc + 9.6], [14, 25, xc + 10.8, xc + 19.8], [26, 37, xc + 20.4, xc + 29.4]] };
}
const filasSet = (dy) => ({ alin: 79.1 + dy, entra: 92.2 + dy, mEntra: 105.1 + dy, mVuelve: 118.1 + dy, saque: 131.0 + dy });
const hhmm = (iso, xh, xc, base) => { const [h, m] = hora(iso).split(':'); return h ? linea(xh, base, xc - xh - 1, h, { al: 'right', fs: 9 }) + linea(xc + 2.5, base, 16, m, { fs: 9 }) : ''; };
const conNumero = (prog, eq, desde = 0) => prog.filter((p) => p.eq === eq && !p.anulado).map((p, i) => ({ ...p, n: i + 1 })).filter((p) => p.n > desde);

function setBloque(st, s, eqIzq, out) {
  const [dx, dy] = SET.off[s.n], eqs = [eqIzq, eqIzq === 'L' ? 'V' : 'L'];
  out.push(hhmm(s.inicio, dx + 46, dx + SET.inici[1], dy + 64.5), hhmm(s.fin, dx + 353.5, dx + SET.final[1], dy + 63.7));
  if (s.inicio && s.fin) out.push(txt(dx + SET.min[0], dy + SET.min[1], SET.min[2], SET.min[3], String(Math.round((Date.parse(s.fin) - Date.parse(s.inicio)) / 60000)), { al: 'center' }));
  eqs.forEach((eq, k) => {
    const mx = dx + k * SET.mitad;
    out.push(linea(dx + SET.abrev[k][0], dy + 64.9, SET.abrev[k][1], st.__abrev[eq], { b: true, fs: 9 }));
    const [sx1, sx2] = SET.sr[k], yS = dy + SET.fila.cab;
    out.push(s.saqueInicial === eq ? raya(dx + sx1 + 1, yS + 1, dx + sx2 - 1, yS + 6) : raya(dx + sx1 + 1, yS + 7.5, dx + sx2 - 1, yS + 12.5));
    const pn = puntsNormal(mx + 200.65, dy + 70.75), prog = conNumero(s.progreso, eq);
    mitad({ cols: SET.col.map((c) => c + mx), subs: SET.sub.map((c) => c + mx), y: filasSet(dy), al: s.alineacion[eq] || [], sust: s.sust[eq],
      x: s.saqueInicial && s.saqueInicial !== eq, turnos: s.turnos[eq], final: !!s.fin, puntos: prog, total: prog.length, punto: pn.punto, reloj: s.fin ? pn.reloj : null,
      tiempos: s.tiempos[eq], T: SET.T.map(([yy, hh]) => [mx + 195.9, dy + yy, hh]) }, out);
  });
}

// ---------- Set 5 (decisivo): 3 partes ----------
// Parte 1: el equipo que empieza a la izquierda, hasta el cambio de campo (PUNTS solo 1-8). Parte 2: el otro equipo, entero.
// Parte 3 (a la derecha del todo): el primer equipo después del cambio; se vuelve a escribir la formación, las
// sustituciones y los tiempos de antes del cambio (se apuntan en ambos lados) y los turnos y puntos siguen donde iban.
// El turno que va en curso al cambiar se deja abierto en la parte 1 (solo "/") y se cierra en la parte 3 (Ferran).
const S5 = { dy: 259.4, dyP: 260.0, p1: 0.5, p2: 196.6, p3: 395.7, circ: { p1: [116.6, 319.0], p2: [258.2, 319.0], p3: [457.4, 319.0], canvi: [530.3, 319.0] } };
function set5Bloque(A, st, s, M, out) {
  const OT = (e) => (e === 'L' ? 'V' : 'L');
  const X = s.cambioHecho ? OT(s.izq) : s.izq, Y = OT(X), dy = S5.dy, cab = 312.5;
  // Estado justo al cambiar de campo: se reproduce el acta suceso a suceso hasta que el set 5 marca el cambio.
  let sc = null;
  if (s.cambioHecho) for (let k = 1; k <= A.ev.length; k++) { const t = M.reproducir(A.cfg, A.datos, A.ev.slice(0, k)), u = M.setActual(t); if (u.n === s.n && u.cambioHecho) { sc = u; break; } }
  const letra = (eq) => (eq === st.sets[0].izq ? 'A' : 'B');
  const enCirc = ([cx, cy], t) => txt(cx - 5, cy - 6, 10, 12, t, { al: 'center', b: true });
  out.push(enCirc(S5.circ.p1, letra(X)), enCirc(S5.circ.p2, letra(Y)), enCirc(S5.circ.p3, letra(X)));
  out.push(linea(125, 324.5, 58, st.__abrev[X], { b: true, fs: 9 }), linea(266, 324.5, 112, st.__abrev[Y], { b: true, fs: 9 }));
  out.push(hhmm(s.inicio, 47, 64.1, 324.0), hhmm(s.fin, 561, 575.4, 324.5));
  if (s.inicio && s.fin) out.push(txt(8.5, 426, 21.3, 16, String(Math.round((Date.parse(s.fin) - Date.parse(s.inicio)) / 60000)), { al: 'center' }));
  for (const [eq, x1, x2] of [[X, 185.5, 196.5], [Y, 381.2, 392.6]]) out.push(s.saqueInicial === eq ? raya(x1 + 1, cab + 1, x2 - 1, cab + 6) : raya(x1 + 1, cab + 7.5, x2 - 1, cab + 12.5));
  const cols = (d) => SET.col.map((c) => c + d), subs = (d) => SET.sub.map((c) => c + d), y = filasSet(dy), al = s.alineacion;
  const T = (d) => SET.T.map(([yy, hh]) => [d + 195.9, yy + dy, hh]);
  // Parte 2: el otro equipo, entero
  const pn2 = puntsNormal(S5.p2 + 200.65, 70.75 + S5.dyP), prog2 = conNumero(s.progreso, Y);
  mitad({ cols: cols(S5.p2), subs: subs(S5.p2), y, al: al[Y] || [], sust: s.sust[Y], x: s.saqueInicial !== Y, turnos: s.turnos[Y], final: !!s.fin,
    puntos: prog2, total: prog2.length, punto: pn2.punto, reloj: s.fin ? pn2.reloj : null, tiempos: s.tiempos[Y], T: T(S5.p2) }, out);
  // Parte 1: el primer equipo hasta el cambio
  const pre = sc || s, ptsCambio = conNumero(pre.progreso, X).length;
  const tPre = pre.turnos[X].map((t) => (t.hasta == null ? { ...t, abierto: true } : t));
  const p1punto = (n) => (n >= 1 && n <= 8 ? [S5.p1 + 211.15, 333.35 + (n - 1) * 6.7] : null);
  mitad({ cols: cols(S5.p1), subs: subs(S5.p1), y, al: al[X] || [], sust: pre.sust[X], x: s.saqueInicial !== X, turnos: tPre, final: !sc && !!s.fin,
    puntos: conNumero(pre.progreso, X), total: ptsCambio, punto: p1punto, reloj: null, tiempos: pre.tiempos[X], T: T(S5.p1) }, out);
  if (!sc) return;
  out.push(enCirc(S5.circ.canvi, String(ptsCambio)));
  // Parte 3: después del cambio (formación, sustituciones y tiempos de antes se vuelven a escribir)
  const nCerrados = pre.turnos[X].filter((t) => t.hasta != null).length;
  const pn3 = puntsNormal(S5.p3 + 200.65, 70.75 + S5.dyP), prog3 = conNumero(s.progreso, X);
  mitad({ cols: cols(S5.p3), subs: subs(S5.p3), y, al: al[X] || [], sust: s.sust[X], x: false, turnos: s.turnos[X].slice(nCerrados), final: !!s.fin,
    puntos: prog3.filter((p) => p.n > ptsCambio), total: prog3.length, punto: pn3.punto, reloj: s.fin ? pn3.reloj : null, tiempos: s.tiempos[X], T: T(S5.p3) }, out);
}


// ---------- Abajo: sanciones, solicitud improcedente, resultados, horas, ganador y observaciones ----------
const CARGO = { E: 'E', E2: '2E', E3: '3E', F: 'F', M: 'M', PS: 'PS', PF: 'PF', MS: 'MS' };
const COL_SANC = { amonestacion: 0, castigo: 1, expulsion: 2, descalificacion: 3, avisoRetraso: 0, castigoRetraso: 1 };
const SANC_X = [8.3, 23.1, 37.8, 52.6, 67.4, 82.1, 96.9, 128.7], SANC_Y0 = 528.4, SANC_H = 12.0, SANC_FILAS = 5;
const TAULA_X = [464.2, 483.9, 501.4, 518.9, 543.3, 567.8, 585.2, 602.8, 621.5], TAULA_Y = [467.8, 480.8, 493.7, 506.8, 519.7, 532.7, 546.2];
const BARRAS_RES = [225.6, 277.4, 331.2, 386.4, 440.2];   // las "/" impresas de RESULTATS (L/V)
const nomEq = (st, eq) => st.equipos[eq].nombre || '';
// Observaciones que salen solas, en catalán (frases de las circulares de la FCVB) + las escritas por el anotador.
function observaciones(A, st) {
  const d = A.datos, o = [];
  for (const eq of ['L', 'V']) {
    const n = (eq === 'L' ? d.local : d.visitante) || nomEq(st, eq);
    if (d['delegado' + eq]) o.push(`L'equip ${n} presenta delegat/da ${d['delegado' + eq]}.`);
    const cad = st.equipos[eq].jugadores.filter((j) => j.cat === 'C').map((j) => j.num);
    if (cad.length) o.push(`L'equip ${n} inscriu jugadors/es cadets: ${cad.join(', ')}.`);
    for (const [rol, t] of [['PS', 'psicòleg/oga'], ['PF', 'preparador/a físic/a'], ['MS', 'massatgista']]) {
      const x = st.equipos[eq].oficiales.find((z) => z.rol === rol && z.nombre); if (x) o.push(`L'equip ${n} inscriu ${t}: ${x.nombre}.`);
    }
    const f = st.equipos[eq].oficiales.find((z) => z.rol === 'F' && z.nombre), m = st.equipos[eq].oficiales.find((z) => z.rol === 'M' && z.nombre);
    if (f && m) o.push(`L'equip ${n} inscriu metge/essa: ${m.nombre}.`);   // el T/M ya lleva al fisio
  }
  for (const s of st.sets) for (const eq of ['L', 'V']) for (const x of s.sust[eq].filter((z) => z.tipo === 'excepcional'))
    o.push(`Set ${s.n}: substitució excepcional de l'equip ${nomEq(st, eq)}, surt el ${x.sale} i entra el ${x.entra} (${x.a}:${x.b}).`);
  for (const eq of ['L', 'V']) for (const x of st.liberosFuera[eq])
    o.push(x.nuevo ? `L'equip ${nomEq(st, eq)} redesigna com a lliure el núm. ${x.nuevo} al set ${x.set} (${x.a}:${x.b}) per la incapacitat del lliure ${x.libero}.`
      : `El lliure ${x.libero} de l'equip ${nomEq(st, eq)} és declarat incapaç de jugar al set ${x.set} (${x.a}:${x.b}).`);
  if (st.incompleto) o.push(st.incompleto.motivo === 'incomparecencia' ? `No presentació de l'equip ${nomEq(st, st.incompleto.eq)}.` : `L'equip ${nomEq(st, st.incompleto.eq)} queda incomplet al set ${st.incompleto.set} (${st.incompleto.a}:${st.incompleto.b}).`);
  const sanc = st.sanciones.filter((x) => COL_SANC[x.tipo] != null);
  if (sanc.length > SANC_FILAS) for (const x of sanc.slice(SANC_FILAS))
    o.push(`Sanció (${{ amonestacion: 'amonestació', castigo: 'càstig', expulsion: 'expulsió', descalificacion: 'desqualificació', avisoRetraso: 'amonestació per demora', castigoRetraso: 'càstig per demora' }[x.tipo]}) a ${M_DORSAL(x.quien) ? 'el ' + x.quien : CARGO[x.quien] || x.quien} de l'equip ${nomEq(st, x.eq)}, set ${x.set} (${x.a}:${x.b}).`);
  for (const x of st.observaciones) o.push(x.texto);
  return o;
}
const M_DORSAL = (q) => /^\d{1,2}$/.test(String(q));
function abajo(A, st, M, eqA, out) {
  const d = A.datos, letra = (eq) => (eq === eqA ? 'A' : 'B'), eqB = eqA === 'L' ? 'V' : 'L';
  // Sanciones: número (E, 2E… si es oficial; D si es por demora) en la columna A/C/E/D, equipo, set y marcador
  st.sanciones.filter((x) => COL_SANC[x.tipo] != null).slice(0, SANC_FILAS).forEach((x, i) => {
    const y = SANC_Y0 + i * SANC_H, c = COL_SANC[x.tipo];
    const quien = /Retraso/.test(x.tipo) ? 'D' : M_DORSAL(x.quien) ? x.quien : CARGO[x.quien] || x.quien;
    out.push(txt(SANC_X[c], y, SANC_X[c + 1] - SANC_X[c], SANC_H, quien, { al: 'center', fs: 8.5 }));
    out.push(txt(SANC_X[4], y, SANC_X[5] - SANC_X[4], SANC_H, letra(x.eq), { al: 'center', fs: 8.5 }));
    out.push(txt(SANC_X[5], y, SANC_X[6] - SANC_X[5], SANC_H, x.set, { al: 'center', fs: 8.5 }));
    out.push(txt(SANC_X[6], y, 14.5, SANC_H, x.a, { al: 'right', fs: 8.5 }), txt(114.8, y, 13, SANC_H, x.b, { fs: 8.5 }));
  });
  // Solicitud improcedente: X sobre la A o la B
  for (const eq of ['L', 'V']) if (st.impropias[eq] > 0) { const [cx, cy] = letra(eq) === 'A' ? [76.2, 508.9] : [114.5, 508.9]; out.push(raya(cx - 5, cy - 5, cx + 5, cy + 5), raya(cx + 5, cy - 5, cx - 5, cy + 5)); }
  // Cuadro de resultados: A (T S G PUNTS) y B (PUNTS G S T) por set y total
  const r = M.resultados(st);
  out.push(txt(479, 442.2, 63, 12.7, st.__abrev[eqA], { b: true }), txt(556, 442.2, 64, 12.7, st.__abrev[eqB], { b: true }));
  const fila = (i, a, b) => { const y = TAULA_Y[i], h = TAULA_Y[i + 1] - y, v = [a.tiempos, a.sust, a.gana, a.puntos, b.puntos, b.gana, b.sust, b.tiempos];
    v.forEach((t, k) => out.push(txt(TAULA_X[k], y, TAULA_X[k + 1] - TAULA_X[k], h, t, { al: 'center', fs: 8.5 }))); };
  r.filas.slice(0, 5).forEach((f, i) => fila(i, f[eqA], f[eqB]));
  if (r.filas.length && st.fase === 'fin') fila(5, r.total[eqA], r.total[eqB]);
  // HI, HF, TT (duración total hh:mm) y ganador "3 : x"
  if (r.inicio) out.push(linea(479, 557.9, 35, hora(r.inicio), { fs: 8.5 }));
  if (r.fin) out.push(linea(528.5, 558.2, 43, hora(r.fin), { fs: 8.5 }));
  if (r.inicio && r.fin) { const m = Math.round((Date.parse(r.fin) - Date.parse(r.inicio)) / 60000); out.push(linea(585, 558.2, 36, `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, { fs: 8.5 })); }
  if (r.ganador) { const g = r.ganador; out.push(linea(467, 582.0, 120, g === 'L' ? d.local : d.visitante), linea(603, 582.0, 15, String(Math.min(r.total.L.gana, r.total.V.gana)))); }
  // RESULTATS (L/V): "25/20 ; 20/25…" alrededor de las barras impresas
  st.sets.filter((s) => s.fin && !s.golden).slice(0, 5).forEach((s, i) => { const b = BARRAS_RES[i];
    out.push(linea(b - 24, 584.8, 21, s.puntos.L, { al: 'right', fs: 9 }), linea(b + 4, 584.8, 21, s.puntos.V, { fs: 9 })); });
  // Observaciones: 4 líneas; lo que no cabe, a la hoja anexa (Format 5)
  const FS = 7.2, lineas = [[80, 453.3, 382], [11, 465.6, 451], [11, 478.6, 451], [11, 491.6, 451]];   // [x, línea base, ancho]
  const todas = observaciones(A, st).join(' · ');
  const partes = []; let resto = todas;
  for (let i = 0; i < lineas.length && resto; i++) {
    const ult = i === lineas.length - 1, w = lineas[i][2] - (ult ? 80 : 0);
    const ls = enLineas(resto, w, FS), l = ls[0] || ''; partes.push(l); resto = resto.slice(resto.indexOf(l) + l.length).trim();
  }
  partes.forEach((t, i) => out.push(linea(lineas[i][0], lineas[i][1], lineas[i][2], t, { fs: FS })));
  if (resto) out.push(linea(383, 491.6, 79, 'Continua al full annex', { fs: 6.5, b: true }));
  return resto;
}
// Hoja anexa "Format 5" (A4 vertical): ampliación de las observaciones
const MESOS = ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre'];
function annex(A, resto) {
  const d = A.datos, out = [], f = String(d.fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (f) { const y = +f[1], mes = +f[2], ini = mes >= 8 ? y : y - 1; out.push(linea(116, 134.9, 14, String(ini).slice(2), { al: 'center', fs: 10 }), linea(151.3, 134.9, 14, String(ini + 1).slice(2), { al: 'center', fs: 10 })); }
  out.push(linea(100, 181.2, 202, [d.competicion, d.categoria].filter(Boolean).join(' · '), { fs: 10 }));
  out.push(linea(89, 205.3, 215, `${d.local || ''} - ${d.visitante || ''}`, { fs: 10 }));
  out.push(linea(100, 228.2, 203, `${fecha(d.fecha)}${d.hora ? ' ' + d.hora : ''}`, { fs: 10 }), linea(85, 251.3, 215, d.ciudad || d.pabellon || '', { fs: 10 }));
  out.push(linea(72, 298.5, 152, cognomNom(d.r1), { fs: 10 }), linea(137, 312.0, 24, d.r1Lic || '', { al: 'center', fs: 10 }));
  // Comentarios: un renglón por línea impresa (no van a distancia fija)
  const RENGLONES = [397.5, 417.0, 432.7, 452.2, 470.2, 489.6];
  enLineas('(continuació) ' + resto, 500, 9.5).slice(0, RENGLONES.length).forEach((l, i) => out.push(linea(38, RENGLONES[i] - 2, 500, l, { fs: 9.5 })));
  if (f) out.push(linea(305, 736.3, 60, d.ciudad || '', { al: 'center', fs: 10 }), linea(380, 736.3, 14, String(+f[3]), { al: 'center', fs: 10 }), linea(409, 736.3, 89, MESOS[+f[2] - 1], { al: 'center', fs: 10 }), linea(513, 736.3, 33, f[1], { al: 'center', fs: 10 }));
  return `<div class="fcvb-pagina vertical" data-noi18n style="color:${TINTA}"><img class="fcvb-fondo" src="fcvb/complement-observacions.svg" alt="">${out.join('')}</div>`;
}

function pagina(A, ST, M) {
  const d = A.datos, e = ST.equipos, out = [];
  const eqA = ST.sets[0]?.izq || null;                       // equipo A = el de la izquierda del anotador en el set 1
  const letra = (eq) => (eqA ? (eq === eqA ? 'A' : 'B') : '');
  // Cabecera
  out.push(linea(70, 18.0, 305, [d.competicion, d.categoria].filter(Boolean).join(' · ')));
  out.push(linea(407, 20.1, 72, fecha(d.fecha)));
  const [hh, mm] = String(d.hora || '').split(':');
  out.push(linea(512, 20.6, 20, hh || '', { al: 'right' }), linea(537, 20.6, 22, mm || ''));
  out.push(linea(64, 34.4, 214, d.local), linea(337, 34.7, 222, d.visitante));
  if (eqA) { const l = G.letraL[letra('L')], v = G.letraV[letra('V')]; out.push(circulo(l[0], l[1], 5.2), circulo(v[0], v[1], 5.2)); }
  out.push(linea(91, 50.3, 465, [d.pabellon, d.ciudad].filter(Boolean).join(' - ')));
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
    const base = [507.6, 525.9, 546.5][i];
    out.push(linea(G.arbNom[0], base, G.arbNom[1], cognomNom(n)), linea(G.arbLic[0], base + (i === 0 ? 2.8 : 0), G.arbLic[1], lic, { al: 'center', fs: i === 0 ? 8.5 : 9.5 }));   // la 1ª fila lleva el rótulo LLICÈNCIA arriba
  });
  // Sets 1 a 4 y el 5 (decisivo, en 3 partes). Equipo de la mitad izquierda: A en los sets 1 y 3, B en los 2 y 4.
  ST.__abrev = { L: d.abrevL || abreviatura(d.local), V: d.abrevV || abreviatura(d.visitante) };
  if (eqA) for (const s of ST.sets) if (s.inicio && s.n <= 4 && !s.golden) setBloque(ST, s, s.n % 2 ? eqA : (eqA === 'L' ? 'V' : 'L'), out);
  const s5 = ST.sets.find((x) => x.n === 5 && x.decisivo && !x.golden && x.inicio);
  if (eqA && s5) set5Bloque(A, ST, s5, M, out);
  const resto = eqA ? abajo(A, ST, M, eqA, out) : '';
  return `<div class="fcvb-pagina" data-noi18n style="color:${TINTA}"><img class="fcvb-fondo" src="fcvb/model-acta-estandard.svg" alt="">${out.join('')}</div>${resto ? annex(A, resto) : ''}`;
}

window.ActaFcvb = { pagina, abreviatura, cognomNom, W, H };
})();
