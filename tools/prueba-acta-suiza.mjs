// Partido de prueba oficial del e-Scoresheet (Data Project) de Swiss Volley: "Test-Match eScoresheet #1" (2021, v5.0),
// 5 sets y 421 pasos con el marcador esperado tras cada uno (líberos, cambios dobles, sanciones, retrasos, peticiones
// improcedentes, repetición, líbero lesionado y redesignado, set decisivo). Lo reproduce en docs/acta/motor.js y compara.
// Uso, desde la raíz del repo: node tools/prueba-acta-suiza.mjs   (necesita pdftotext; baja el PDF cada vez, no se guarda)
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process'; import { createRequire } from 'node:module';
const URL_PDF = 'https://www.volleyball.ch/_Resources/Persistent/d/7/9/2/d792c82c4b1dab3b32915185823cd3c24c4d543c/eScoresheet-Diktat-%231_2021-09-13_v5.0.pdf';
const M = createRequire(import.meta.url)('../docs/acta/motor.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acta-suiza-'));
fs.writeFileSync(path.join(dir, 'p.pdf'), Buffer.from(await (await fetch(URL_PDF)).arrayBuffer()));
execFileSync('pdftotext', ['-layout', path.join(dir, 'p.pdf'), path.join(dir, 'p.txt')]);
const lines = fs.readFileSync(path.join(dir, 'p.txt'), 'utf8').split('\n');
fs.rmSync(dir, { recursive: true, force: true });
// --- 1. Pasos: número, columna (A/B/R) y texto; cabeceras de tabla dicen qué equipo va en cada columna.
let COL = [9, 46, 74, 108]; const pasos = []; let colA = null, colB = null, setN = 0, cur = null;
for (const l of lines) {
  const hd = l.match(/Activity ([AB]) \(TEST Team ([AB])\)\s+Activity ([AB]) \(TEST Team ([AB])\)/);
  if (hd) { colA = hd[2]; colB = hd[4]; const i1 = l.indexOf('Activity'), i2 = l.indexOf('Activity', i1 + 5), i3 = l.indexOf('Remarks'), i4 = l.indexOf('Score'); COL = [i1 - 1, i2 - 1, i3 - 1, i4 - 1]; continue; }
  const sm = l.match(/^\s*(\d)(st|nd|rd|th) Set/); if (sm) { setN = +sm[1]; continue; }
  const m = l.match(/^ (\d{3}) (.*)$/);
  if (m && colA) {
    const resto = ' '.repeat(9) + m[2].padEnd(0); const full = l;
    const sc = full.match(/(\d+)[-:.](\d+)\s*$/);
    const seg = (a, b) => full.slice(a, b).trim();
    cur = { n: +m[1], set: setN, A: seg(COL[0], COL[1]), B: seg(COL[1], COL[2]), R: full.slice(COL[2]).replace(/\s*\d+[-:.]\d+\s*$/, '').trim(), sc: sc ? [+sc[1], +sc[2]] : null, cols: [colA, colB] };
    pasos.push(cur); continue;
  }
  if (/^At the end of the Game/.test(l.trim())) { cur = null; break; }
  if (cur && /^\s{9,}\S/.test(l) && !/Swiss Volley|Test-Match|Step|the activity/.test(l)) {   // continuación (alineaciones, sustituciones dobles)
    const seg = (a, b) => l.slice(a, b).trim();
    for (const [k, a, b] of [['A', COL[0], COL[1]], ['B', COL[1], COL[2]], ['R', COL[2], 999]]) { const t = seg(a, b); if (t) cur[k] += ' ' + t; }
  } else if (!l.trim()) cur = cur;
}
// --- 2. Partido: L = TEST Team A, V = TEST Team B.
const EQ = { A: 'L', B: 'V' };
const jug = (nums, cap, libs) => nums.map((n) => ({ num: String(n), nombre: 'J' + n, cap: n === cap, lib: libs.includes(n) }));
const ev = [
  { t: 'equipo', eq: 'L', nombre: 'TEST Team A', jugadores: jug([1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13], 1, [12, 13]), oficiales: [{ rol: 'E', nombre: 'Coach A' }] },
  { t: 'equipo', eq: 'V', nombre: 'TEST Team B', jugadores: jug([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 12, [1]), oficiales: [{ rol: 'E', nombre: 'Coach B' }] },
  { t: 'sorteo', saca: 'L', izq: 'V' },   // Team B a la izquierda, saca Team A
];
const cfg = {}; let reloj = Date.parse('2026-11-07T17:00:00Z'); const h = () => new Date((reloj += 20000)).toISOString();
const st = () => M.reproducir(cfg, {}, ev);
const problemas = [], notas = []; let auto = 0;
let pendientesLib = [];   // líberos que entran antes de "Start Set": se aplican tras inicioSet
const intenta = (e, paso, txt) => { const m = M.validar(cfg, {}, ev, { ...e, h: h() }); if (m) { problemas.push(`paso ${paso} (${txt}): el motor dice "${m}"`); return false; } ev.push({ ...e, h: h() }); return true; };
const nums = (t) => [...t.matchAll(/#?\s?(\d+)/g)].map((x) => x[1]);
for (const p of pasos) {
  for (const k of ['A', 'B']) {
    const t = p[k]; if (!t) continue;
    const team = EQ[p.cols[k === 'A' ? 0 : 1]];
    if (/^Line-up/.test(t)) { const pos = [...t.matchAll(/Pos (\d): #?\s?(\d+)/g)]; const a = []; for (const [, i, n] of pos) a[+i - 1] = n; intenta({ t: 'alineacion', eq: team, jugadores: a }, p.n, t); }
    else if (/^Wins the rally/.test(t)) intenta({ t: 'punto', eq: team }, p.n, t);
    else if (/Request for Time-Out/.test(t)) { const nx = pasos[pasos.indexOf(p) + 1]; if (nx && /improper request/.test(nx.R)) { const m = M.validar(cfg, {}, ev, { t: 'tiempo', eq: team }); notas.push(`paso ${p.n}: 3er tiempo pedido -> el motor lo rechaza ("${m}") y el documento lo anota como petición improcedente`); } else intenta({ t: 'tiempo', eq: team }, p.n, t); }
    else if (/Substitution/.test(t)) { for (const [, e, s] of t.matchAll(/#(\d+) IN\s*,\s*#(\d+) OUT/g)) { if (!intenta({ t: 'sust', eq: team, sale: s, entra: e }, p.n, t)) { if (intenta({ t: 'sust', eq: team, sale: s, entra: e, tipo: 'excepcional' }, p.n, t + ' [excepcional]')) notas.push(`paso ${p.n}: entra como sustitución EXCEPCIONAL`); } } }
    else if (/Libero #?\s?\d+ IN, Libero #?\s?\d+ OUT|Libero #?\s?\d+ OUT, Libero #?\s?\d+ IN/.test(t)) { const inn = t.match(/Libero #?\s?(\d+) IN/)[1], out = t.match(/Libero #?\s?(\d+) OUT/)[1]; const e = { t: 'liberoEntra', eq: team, libero: inn, sale: out }; if (st().fase === 'juego') intenta(e, p.n, t); else pendientesLib.push([e, p.n, t]); }
    else if (/^Libero #?\s?\d+ IN, #\d+ OUT/i.test(t)) { const [l, s] = nums(t); const e = { t: 'liberoEntra', eq: team, libero: l, sale: s }; const sl = M.setActual(st()).libero[team]; if (sl && sl.num === l && sl.por === s) { notas.push(`paso ${p.n}: el líbero redesignado ${l} ya está en pista por el ${s} (nuestro motor lo pone directamente)`); continue; } if (st().fase === 'juego') intenta(e, p.n, t); else pendientesLib.push([e, p.n, t]); }
    else if (/^#\d+ IN\s*, Libero #?\s?\d+ OUT/.test(t)) { const [vuelve] = nums(t); const s = M.setActual(st()); if (!s.libero[team] && s.rot[team]?.includes(vuelve)) { auto++; continue; } if (s.libero[team]?.por !== vuelve) problemas.push(`paso ${p.n}: vuelve el ${vuelve} pero el líbero estaba por el ${s.libero[team]?.por}`); intenta({ t: 'liberoSale', eq: team }, p.n, t); }
    else if (/becomes game captain/.test(t)) notas.push(`paso ${p.n}: capitán en juego (${t.match(/#\d+/)[0]}): el anotador no hace nada`);
    else if (/declared unable to play/.test(t)) { p._unable = { eq: team, lib: nums(t)[0] }; const nxt = pasos[pasos.indexOf(p) + 1]; const nxt2 = pasos[pasos.indexOf(p) + 2]; const redes = [nxt, nxt2].find((x) => x && /Re-designation/.test(x.A + x.B)); const injured = nxt && /is injured/.test(nxt.A + nxt.B);
      if (injured) intenta({ t: 'liberoNoPuede', eq: team, libero: p._unable.lib }, p.n, t);
      else if (redes) { /* se aplica con la redesignación */ p._skip = true; }
      else intenta({ t: 'liberoNoPuede', eq: team, libero: p._unable.lib }, p.n, t); p._team = team; }
    else if (/is injured/.test(t)) { const lib = nums(t)[0]; const nxt = pasos[pasos.indexOf(p) + 1]; const nuevo = nxt && /Re-designation/.test(nxt.A + nxt.B) ? (nxt.A + nxt.B).match(/#(\d+) becomes/)[1] : undefined; intenta({ t: 'liberoNoPuede', eq: team, libero: lib, nuevo }, p.n, t); p._done = true; }
    else if (/Re-designation/.test(t)) { const prev = pasos[pasos.indexOf(p) - 1]; if (prev._done) continue; const nuevo = t.match(/#(\d+) becomes/)[1]; intenta({ t: 'liberoNoPuede', eq: team, libero: prev._unable.lib, nuevo }, p.n, t); }
    else if (/Warning \(yellow card\) for Coach/.test(t)) intenta({ t: 'sancion', eq: team, quien: 'E', tipo: 'amonestacion' }, p.n, t);
    else if (/Warning \(yellow card\) for #/.test(t)) intenta({ t: 'sancion', eq: team, quien: nums(t)[0], tipo: 'amonestacion' }, p.n, t);
    else if (/Penalty \(red card\) for #/.test(t)) intenta({ t: 'sancion', eq: team, quien: nums(t)[0], tipo: 'castigo' }, p.n, t);
    else if (/^Expulsion/.test(t)) intenta({ t: 'sancion', eq: team, quien: nums(t)[0], tipo: 'expulsion' }, p.n, t);
    else if (/^Disqualification/.test(t)) intenta({ t: 'sancion', eq: team, quien: nums(t)[0], tipo: 'descalificacion' }, p.n, t);
    else if (/^Delay Warning/.test(t)) intenta({ t: 'sancion', eq: team, quien: 'equipo', tipo: 'avisoRetraso' }, p.n, t);
    else if (/^Delay Penalty/.test(t)) intenta({ t: 'sancion', eq: team, quien: 'equipo', tipo: 'castigoRetraso' }, p.n, t);
    else if (/Results of the Coin Toss/.test(t)) { const saca = EQ[t.match(/\(TEST Team ([AB])\) will\s+serve/)[1]]; const der = /right hand side/.test(t) ? saca : null; intenta({ t: 'sorteo', saca, izq: der ? (saca === 'L' ? 'V' : 'L') : saca }, p.n, t); }
    else problemas.push(`paso ${p.n}: no sé traducir "${t}"`);
  }
  const R = p.R;
  if (/Results of the Coin/.test(R)) { const saca = EQ[R.match(/\(TEST Team ([AB])\) will\s+serve/)[1]]; const der = /right hand side/.test(R); intenta({ t: 'sorteo', saca, izq: der ? (saca === 'L' ? 'V' : 'L') : saca }, p.n, R); }
  else if (/^Start Set/.test(R)) { intenta({ t: 'inicioSet' }, p.n, R); for (const [e, n, t] of pendientesLib) intenta(e, n, t); pendientesLib = []; }
  else if (/improper request/.test(R)) { const team = EQ[R.match(/\(TEST Team ([AB])\)/)[1]]; intenta({ t: 'impropia', eq: team }, p.n, R); }
  else if (/revises his\s+decision: replay/.test(R)) { const ult = ev[ev.length - 1]; if (ult.t === 'punto') { ev.pop(); notas.push(`paso ${p.n}: "replay" = se QUITA el último punto (${ult.eq}) y se repite: en nuestra acta, Deshacer + Repetición`); intenta({ t: 'repeticion' }, p.n, R); } else problemas.push(`paso ${p.n}: replay sin punto anterior`); }
  else if (/Confirm end of set/.test(R)) { const S = st(); const prev = S.sets.filter((x) => x.ganador).at(-1); if (!prev || prev.n !== p.set) problemas.push(`paso ${p.n}: el set ${p.set} debería haber acabado y el motor no lo da por acabado`); continue; }
  // --- 3. Comparar el marcador (en el orden de las columnas de la tabla).
  if (p.sc && st().fase === 'juego') { const s = M.setActual(st()); const [a, b] = p.cols.map((c) => s.puntos[EQ[c]]); if (a !== p.sc[0] || b !== p.sc[1]) problemas.push(`paso ${p.n}: marcador ${a}-${b}, el documento dice ${p.sc.join('-')} (${(p.A || p.B || p.R).slice(0, 50)})`); }
}
const S = st();
console.log('pasos leídos:', pasos.length, '· sucesos aplicados:', ev.length);
console.log('sets:', S.sets.filter((x) => x.ganador).map((x) => `${x.n}: ${x.puntos.L}-${x.puntos.V} (A-B)`).join(' · '), '· ganados A-B', S.ganados.L + '-' + S.ganados.V, '· fase', S.fase);
console.log('salidas del líbero que nuestro motor ya hace solo (al pasar a delantero):', auto);
console.log('\nNOTAS:\n' + notas.join('\n'));
console.log('\nPROBLEMAS (' + problemas.length + '):\n' + problemas.join('\n'));
const final = S.sets.filter((x) => x.ganador).map((x) => `${x.puntos.L}-${x.puntos.V}`).join(' ');
const ok = !problemas.length && final === '13-25 27-25 25-13 23-25 18-16' && S.fase === 'fin';
console.log(ok ? '\nOK: el acta da lo mismo que el e-Scoresheet en los 421 pasos.' : '\nFALLA');
process.exit(ok ? 0 : 1);
