// Pruebas del motor del acta electrónica (docs/acta/motor.js): reglas FIVB 6x6.
// Uso, desde la raíz del repo: node --test tools/prueba-acta-motor.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const M = createRequire(import.meta.url)('../docs/acta/motor.js');

let reloj = Date.parse('2026-11-07T17:00:00Z');
const h = (min = 0.5) => new Date((reloj += min * 60000)).toISOString();
const plantilla = (eq, extra = []) => ({ t: 'equipo', eq, nombre: eq === 'L' ? 'CV LOCAL' : 'CV VISITANTE',
  jugadores: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => ({ num, nombre: `J${eq}${num}`, cap: num === 1 })).concat(extra),
  oficiales: [{ rol: 'E', nombre: 'ENTRENADOR ' + eq }] });
// Partido listo para empezar el set 1: saca L, L a la izquierda. Alineaciones 1..6 en I..VI.
function preparado(cfg) {
  const ev = [plantilla('L', [{ num: 12, nombre: 'LIB L', lib: true }, { num: 13, nombre: 'LIB2 L', lib: true }]), plantilla('V', [{ num: 12, nombre: 'LIB V', lib: true }]),
    { t: 'sorteo', saca: 'L', izq: 'L', h: h() },
    { t: 'alineacion', eq: 'L', jugadores: [1, 2, 3, 4, 5, 6] }, { t: 'alineacion', eq: 'V', jugadores: [1, 2, 3, 4, 5, 6] },
    { t: 'inicioSet', h: h() }];
  return { cfg, ev, st: () => M.reproducir(cfg, {}, ev), add(e) { const m = M.validar(cfg, {}, ev, e); if (m) throw new Error(m); ev.push({ h: h(0.4), ...e }); return this; },
    falla(e) { return M.validar(cfg, {}, ev, e); } };
}
const puntos = (p, eq, n) => { for (let i = 0; i < n; i++) p.add({ t: 'punto', eq }); };
const set = (p) => M.setActual(p.st());

test('marcador, saque y rotación', () => {
  const p = preparado();
  let s = set(p);
  assert.equal(s.saque, 'L'); assert.deepEqual(s.rot.L, [1, 2, 3, 4, 5, 6]);
  p.add({ t: 'punto', eq: 'L' });                 // L saca y gana: sigue sacando, no rota
  s = set(p); assert.equal(s.saque, 'L'); assert.deepEqual(s.rot.L, [1, 2, 3, 4, 5, 6]); assert.deepEqual(s.puntos, { L: 1, V: 0 });
  p.add({ t: 'punto', eq: 'V' });                 // V recupera el saque: rota y saca su jugador 2
  s = set(p); assert.equal(s.saque, 'V'); assert.deepEqual(s.rot.V, [2, 3, 4, 5, 6, 1]); assert.equal(s.rot.V[0], 2);
  assert.equal(s.turnos.L[0].hasta, 1, 'el turno del 1 de L acaba con 1 punto');
  assert.equal(s.turnos.V[0].num, 2); assert.equal(s.turnos.V[0].col, 1, 'saca el de la columna II');
  p.add({ t: 'punto', eq: 'L' });
  s = set(p); assert.deepEqual(s.rot.L, [2, 3, 4, 5, 6, 1]); assert.equal(s.turnos.L[1].num, 2);
});

test('fin de set a 25 con 2 de ventaja y set siguiente', () => {
  const p = preparado();
  puntos(p, 'L', 24); puntos(p, 'V', 24);
  assert.equal(set(p).n, 1, '24-24 sigue');
  p.add({ t: 'punto', eq: 'L' }); assert.equal(set(p).n, 1, '25-24 sigue');
  p.add({ t: 'punto', eq: 'L' });
  const st = p.st();
  assert.equal(st.sets[0].ganador, 'L'); assert.deepEqual(st.sets[0].puntos, { L: 26, V: 24 });
  assert.equal(st.fase, 'entreSets'); assert.equal(st.sets[1].izq, 'V', 'cambian de campo');
  assert.equal(st.sets[1].saqueInicial, 'V', 'saca primero el que no sacó en el set 1');
  assert.ok(p.falla({ t: 'sorteo', saca: 'L', izq: 'L' }), 'no hay sorteo en el set 2');
  assert.ok(p.falla({ t: 'punto', eq: 'L' }), 'sin empezar el set no hay puntos');
});

test('partido a 5 sets: decisivo a 15, cambio de campo a los 8 y resultados', () => {
  const p = preparado();
  const ganaSet = (eq) => { puntos(p, eq, 25); };
  const alinear = () => { p.add({ t: 'alineacion', eq: 'L', jugadores: [1, 2, 3, 4, 5, 6] }); p.add({ t: 'alineacion', eq: 'V', jugadores: [1, 2, 3, 4, 5, 6] }); };
  ganaSet('L'); alinear(); p.add({ t: 'inicioSet' }); ganaSet('V'); alinear(); p.add({ t: 'inicioSet' }); ganaSet('L'); alinear(); p.add({ t: 'inicioSet' }); ganaSet('V');
  let st = p.st(); assert.equal(st.sets[4].decisivo, true);
  assert.equal(p.falla({ t: 'inicioSet' }), 'Faltan las alineaciones.');
  alinear(); assert.equal(p.falla({ t: 'inicioSet' }), 'Falta el sorteo.');
  p.add({ t: 'sorteo', saca: 'V', izq: 'V' }); p.add({ t: 'inicioSet' });
  puntos(p, 'V', 7); assert.equal(set(p).izq, 'V');
  p.add({ t: 'punto', eq: 'V' }); assert.equal(set(p).izq, 'L', 'cambio de campo al llegar a 8'); assert.equal(set(p).cambioHecho, true);
  puntos(p, 'L', 8); assert.equal(set(p).izq, 'L', 'el cambio solo se hace una vez');
  puntos(p, 'V', 7);
  st = p.st(); assert.equal(st.fase, 'fin'); assert.deepEqual(st.sets[4].puntos, { L: 8, V: 15 });
  const r = M.resultados(st);
  assert.equal(r.ganador, 'V'); assert.equal(r.total.V.gana, 3); assert.equal(r.total.L.gana, 2);
  assert.equal(r.filas.length, 5); assert.equal(r.total.L.puntos, 25 * 2 + 8); assert.ok(r.duracionPartido > 0);
  assert.ok(p.falla({ t: 'punto', eq: 'L' }), 'acabado el partido no hay más puntos');
});

test('partido al mejor de 3 (configurable): el 3º es el decisivo', () => {
  const p = preparado({ mejorDe: 3 });
  puntos(p, 'L', 25); p.add({ t: 'alineacion', eq: 'L', jugadores: [1, 2, 3, 4, 5, 6] }); p.add({ t: 'alineacion', eq: 'V', jugadores: [1, 2, 3, 4, 5, 6] });
  p.add({ t: 'inicioSet' }); puntos(p, 'V', 25);
  assert.equal(p.st().sets[2].decisivo, true);
});

test('sustituciones: pareja titular-suplente, vuelta y límites', () => {
  const p = preparado();
  p.add({ t: 'sust', eq: 'L', sale: 3, entra: 7 });
  let s = set(p); assert.deepEqual(s.rot.L, [1, 2, 7, 4, 5, 6]); assert.equal(s.nSust.L, 1);
  assert.match(p.falla({ t: 'sust', eq: 'L', sale: 7, entra: 8 }), /solo puede volver el 3/);
  assert.match(p.falla({ t: 'sust', eq: 'L', sale: 4, entra: 7 }), /ya está en pista/);
  assert.match(p.falla({ t: 'sust', eq: 'L', sale: 4, entra: 3 }), /titular/);
  p.add({ t: 'sust', eq: 'L', sale: 7, entra: 3 });
  s = set(p); assert.deepEqual(s.rot.L, [1, 2, 3, 4, 5, 6]);
  assert.match(p.falla({ t: 'sust', eq: 'L', sale: 3, entra: 8 }), /ya salió y volvió/);
  assert.match(p.falla({ t: 'sust', eq: 'L', sale: 4, entra: 7 }), /ya ha jugado este set/);
  assert.match(p.falla({ t: 'sust', eq: 'L', sale: 4, entra: 12 }), /líbero/);
  assert.match(p.falla({ t: 'sust', eq: 'L', sale: 4, entra: 11 }), /no está en el acta/);
  p.add({ t: 'sust', eq: 'L', sale: 4, entra: 8 }); p.add({ t: 'sust', eq: 'L', sale: 5, entra: 9 }); p.add({ t: 'sust', eq: 'L', sale: 6, entra: 10 });
  p.add({ t: 'sust', eq: 'L', sale: 8, entra: 4 });
  assert.equal(set(p).nSust.L, 6);
  assert.match(p.falla({ t: 'sust', eq: 'L', sale: 9, entra: 5 }), /6 sustituciones/);
  // En el set siguiente se empieza de cero.
  puntos(p, 'L', 25); p.add({ t: 'alineacion', eq: 'L', jugadores: [1, 2, 3, 4, 5, 6] }); p.add({ t: 'alineacion', eq: 'V', jugadores: [1, 2, 3, 4, 5, 6] }); p.add({ t: 'inicioSet' });
  p.add({ t: 'sust', eq: 'L', sale: 3, entra: 7 }); assert.equal(set(p).nSust.L, 1);
});

test('sustitución excepcional: no cuenta y el lesionado no vuelve en el partido', () => {
  const p = preparado();
  p.add({ t: 'sust', eq: 'V', sale: 2, entra: 7 }); p.add({ t: 'sust', eq: 'V', sale: 7, entra: 2 });
  p.add({ t: 'sust', eq: 'V', sale: 2, entra: 8, tipo: 'excepcional' });
  const st = p.st(), s = M.setActual(st);
  assert.equal(s.nSust.V, 2); assert.ok(st.fueraPartido.V.has(2));
  assert.equal(M.resultados(st).filas[0].V.sust, 2, 'en el cuadro de resultados no cuenta');
  assert.match(p.falla({ t: 'sust', eq: 'V', sale: 8, entra: 2 }), /no puede volver/);
});

test('líbero: solo zagueros, no por el que saca, rally entre cambios, sale al pasar a delantero', () => {
  const p = preparado();
  assert.match(p.falla({ t: 'liberoEntra', eq: 'L', libero: 12, sale: 3 }), /zaguero/);
  assert.match(p.falla({ t: 'liberoEntra', eq: 'L', libero: 12, sale: 1 }), /no puede sacar/);
  assert.match(p.falla({ t: 'liberoEntra', eq: 'L', libero: 7, sale: 5 }), /no está inscrito como líbero/);
  p.add({ t: 'liberoEntra', eq: 'V', libero: 12, sale: 5 });   // V recibe: su V (posición V) por el líbero
  assert.deepEqual(M.enPista(set(p), 'V'), [1, 2, 3, 4, 12, 6]);
  assert.match(p.falla({ t: 'liberoSale', eq: 'V' }), /rally completo/);
  assert.match(p.falla({ t: 'sust', eq: 'V', sale: 5, entra: 7 }), /primero tiene que salir el líbero/);
  p.add({ t: 'punto', eq: 'V' });   // V gana el saque y rota: el líbero pasa de V a IV y sale solo
  let s = set(p);
  assert.equal(s.libero.V, null, 'el líbero sale al pasar a la delantera');
  assert.deepEqual(M.enPista(s, 'V'), [2, 3, 4, 5, 6, 1]);
  assert.equal(p.st().auto.filter((a) => a.t === 'liberoSaleAuto').length, 1);
  // Líbero por el zaguero VI de L y cambio de líbero por líbero tras un rally.
  p.add({ t: 'liberoEntra', eq: 'L', libero: 12, sale: 6 });
  assert.match(p.falla({ t: 'liberoEntra', eq: 'L', libero: 13, sale: 12 }), /rally completo/);
  p.add({ t: 'punto', eq: 'V' });
  p.add({ t: 'liberoEntra', eq: 'L', libero: 13, sale: 12 });
  s = set(p); assert.equal(s.libero.L.num, 13); assert.equal(s.libero.L.por, 6);
  p.add({ t: 'punto', eq: 'V' }); p.add({ t: 'liberoSale', eq: 'L' });
  assert.deepEqual(M.enPista(set(p), 'L'), [1, 2, 3, 4, 5, 6]);
});

test('tiempos: 2 por set', () => {
  const p = preparado();
  p.add({ t: 'punto', eq: 'V' }); p.add({ t: 'tiempo', eq: 'L' }); p.add({ t: 'tiempo', eq: 'L' });
  assert.match(p.falla({ t: 'tiempo', eq: 'L' }), /2 tiempos/);
  const s = set(p); assert.deepEqual(s.tiempos.L[0], { a: 0, b: 1, h: s.tiempos.L[0].h }, 'marcador: primero el del que lo pide');
});

test('sanciones: amonestación una vez, castigo da punto y saque, retrasos', () => {
  const p = preparado();
  p.add({ t: 'sancion', eq: 'L', quien: 4, tipo: 'amonestacion' });
  assert.match(p.falla({ t: 'sancion', eq: 'L', quien: 'E', tipo: 'amonestacion' }), /ya ha tenido su amonestación/);
  p.add({ t: 'sancion', eq: 'L', quien: 'E', tipo: 'castigo' });   // L sacaba: punto y saque para V
  let s = set(p); assert.deepEqual(s.puntos, { L: 0, V: 1 }); assert.equal(s.saque, 'V'); assert.equal(s.progreso[0].motivo, 'castigo');
  assert.equal(p.falla({ t: 'sancion', eq: 'V', quien: 'equipo', tipo: 'castigoRetraso' }), 'El primer retraso es un aviso por retraso.');
  p.add({ t: 'sancion', eq: 'V', quien: 'equipo', tipo: 'avisoRetraso' });
  assert.match(p.falla({ t: 'sancion', eq: 'V', quien: 'equipo', tipo: 'avisoRetraso' }), /ya tiene el aviso/);
  p.add({ t: 'sancion', eq: 'V', quien: 'equipo', tipo: 'castigoRetraso' });
  s = set(p); assert.deepEqual(s.puntos, { L: 1, V: 1 });
  const st = p.st(); assert.equal(st.sanciones.length, 4); assert.deepEqual([st.sanciones[1].a, st.sanciones[1].b], [0, 0], 'marcador antes del castigo');
});

test('expulsión: hay que sustituirlo antes de seguir', () => {
  const p = preparado();
  p.add({ t: 'sancion', eq: 'V', quien: 3, tipo: 'expulsion' });
  assert.match(p.falla({ t: 'punto', eq: 'L' }), /sustituir al jugador expulsado/);
  p.add({ t: 'sust', eq: 'V', sale: 3, entra: 7 });
  p.add({ t: 'punto', eq: 'L' });
  assert.match(p.falla({ t: 'sust', eq: 'V', sale: 7, entra: 3 }), /expulsado/);
});

test('plantillas y alineaciones: validaciones', () => {
  const ev = [];
  const mal = (e) => M.validar({}, {}, ev, e);
  assert.match(mal({ t: 'equipo', eq: 'L', jugadores: [{ num: 1 }, { num: 1 }] }), /repetidos/);
  assert.match(mal({ t: 'equipo', eq: 'L', jugadores: [{ num: 1, cap: true, lib: true }] }), /capitán/);
  assert.match(mal({ t: 'equipo', eq: 'L', jugadores: [{ num: 1, lib: true }, { num: 2, lib: true }, { num: 3, lib: true }] }), /2 líberos/);
  const p = preparado();
  const st = M.reproducir({}, {}, p.ev.slice(0, 2));
  assert.equal(st.equipos.L.jugadores.length, 12);
  assert.match(M.validar({}, {}, p.ev.slice(0, 3), { t: 'alineacion', eq: 'L', jugadores: [1, 2, 3, 4, 5, 12] }), /líbero/);
  assert.match(M.validar({}, {}, p.ev.slice(0, 3), { t: 'alineacion', eq: 'L', jugadores: [1, 2, 3, 4, 5] }), /6 jugadores/);
});

test('deshacer = reproducir sin el último suceso', () => {
  const p = preparado();
  puntos(p, 'V', 3); p.add({ t: 'sust', eq: 'L', sale: 3, entra: 7 });
  const antes = M.reproducir({}, {}, p.ev.slice(0, -1));
  assert.deepEqual(M.setActual(antes).rot.L, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(M.setActual(antes).puntos, { L: 0, V: 3 });
});
