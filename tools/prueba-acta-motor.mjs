// Pruebas del motor del acta electrónica (docs/acta/motor.js): reglas FIVB 6x6.
// Uso, desde la raíz del repo: node --test tools/prueba-acta-motor.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const M = createRequire(import.meta.url)('../docs/acta/motor.js');
const S = (a) => a.map(String);   // los dorsales se guardan como texto

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
  assert.equal(s.saque, 'L'); assert.deepEqual(s.rot.L, S([1, 2, 3, 4, 5, 6]));
  p.add({ t: 'punto', eq: 'L' });                 // L saca y gana: sigue sacando, no rota
  s = set(p); assert.equal(s.saque, 'L'); assert.deepEqual(s.rot.L, S([1, 2, 3, 4, 5, 6])); assert.deepEqual(s.puntos, { L: 1, V: 0 });
  p.add({ t: 'punto', eq: 'V' });                 // V recupera el saque: rota y saca su jugador 2
  s = set(p); assert.equal(s.saque, 'V'); assert.deepEqual(s.rot.V, S([2, 3, 4, 5, 6, 1])); assert.equal(s.rot.V[0], '2');
  assert.equal(s.turnos.L[0].hasta, 1, 'el turno del 1 de L acaba con 1 punto');
  assert.equal(s.turnos.V[0].num, '2'); assert.equal(s.turnos.V[0].col, 1, 'saca el de la columna II');
  p.add({ t: 'punto', eq: 'L' });
  s = set(p); assert.deepEqual(s.rot.L, S([2, 3, 4, 5, 6, 1])); assert.equal(s.turnos.L[1].num, '2');
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
  let s = set(p); assert.deepEqual(s.rot.L, S([1, 2, 7, 4, 5, 6])); assert.equal(s.nSust.L, 1);
  assert.match(p.falla({ t: 'sust', eq: 'L', sale: 7, entra: 8 }), /solo puede volver el 3/);
  assert.match(p.falla({ t: 'sust', eq: 'L', sale: 4, entra: 7 }), /ya está en pista/);
  assert.match(p.falla({ t: 'sust', eq: 'L', sale: 4, entra: 3 }), /titular/);
  p.add({ t: 'sust', eq: 'L', sale: 7, entra: 3 });
  s = set(p); assert.deepEqual(s.rot.L, S([1, 2, 3, 4, 5, 6]));
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
  assert.equal(s.nSust.V, 2); assert.ok(st.fueraPartido.V.has('2'));
  assert.equal(M.resultados(st).filas[0].V.sust, 3, 'en el total del acta sí cuenta (FIVB 15.7), aunque no para el límite de 6');
  assert.match(p.falla({ t: 'sust', eq: 'V', sale: 8, entra: 2 }), /no puede volver/);
});

test('líbero: solo zagueros, no por el que saca, rally entre cambios, sale al pasar a delantero', () => {
  const p = preparado();
  assert.match(p.falla({ t: 'liberoEntra', eq: 'L', libero: 12, sale: 3 }), /zaguero/);
  assert.match(p.falla({ t: 'liberoEntra', eq: 'L', libero: 12, sale: 1 }), /no puede sacar/);
  assert.match(p.falla({ t: 'liberoEntra', eq: 'L', libero: 7, sale: 5 }), /no está inscrito como líbero/);
  p.add({ t: 'liberoEntra', eq: 'V', libero: 12, sale: 5 });   // V recibe: su V (posición V) por el líbero
  assert.deepEqual(M.enPista(set(p), 'V'), S([1, 2, 3, 4, 12, 6]));
  assert.match(p.falla({ t: 'liberoSale', eq: 'V' }), /rally completo/);
  assert.match(p.falla({ t: 'sust', eq: 'V', sale: 5, entra: 7 }), /primero tiene que salir el líbero/);
  p.add({ t: 'punto', eq: 'V' });   // V gana el saque y rota: el líbero pasa de V a IV y sale solo
  let s = set(p);
  assert.equal(s.libero.V, null, 'el líbero sale al pasar a la delantera');
  assert.deepEqual(M.enPista(s, 'V'), S([2, 3, 4, 5, 6, 1]));
  assert.equal(p.st().auto.filter((a) => a.t === 'liberoSaleAuto').length, 1);
  // Líbero por el zaguero VI de L y cambio de líbero por líbero tras un rally.
  p.add({ t: 'liberoEntra', eq: 'L', libero: 12, sale: 6 });
  assert.match(p.falla({ t: 'liberoEntra', eq: 'L', libero: 13, sale: 12 }), /rally completo/);
  p.add({ t: 'punto', eq: 'V' });
  p.add({ t: 'liberoEntra', eq: 'L', libero: 13, sale: 12 });
  s = set(p); assert.equal(s.libero.L.num, '13'); assert.equal(s.libero.L.por, '6');
  p.add({ t: 'punto', eq: 'V' }); p.add({ t: 'liberoSale', eq: 'L' });
  assert.deepEqual(M.enPista(set(p), 'L'), S([1, 2, 3, 4, 5, 6]));
});

test('tiempos: 2 por set', () => {
  const p = preparado();
  p.add({ t: 'punto', eq: 'V' }); p.add({ t: 'tiempo', eq: 'L' }); p.add({ t: 'tiempo', eq: 'L' });
  assert.match(p.falla({ t: 'tiempo', eq: 'L' }), /2 tiempos/);
  const s = set(p); assert.deepEqual(s.tiempos.L[0], { a: 0, b: 1, h: s.tiempos.L[0].h }, 'marcador: primero el del que lo pide');
});

test('amonestación después de un castigo o una expulsión de otro jugador del mismo equipo (Casebook FIVB)', () => {
  const p = preparado();
  p.add({ t: 'sancion', eq: 'L', quien: 5, tipo: 'castigo' });
  p.add({ t: 'sancion', eq: 'L', quien: 7, tipo: 'expulsion' });
  assert.equal(p.falla({ t: 'sancion', eq: 'L', quien: 3, tipo: 'amonestacion' }), null, 'la amarilla sigue disponible');
  p.add({ t: 'sancion', eq: 'L', quien: 3, tipo: 'amonestacion' });
  assert.match(p.falla({ t: 'sancion', eq: 'L', quien: 'E', tipo: 'amonestacion' }), /ya ha tenido su amonestación/, 'pero solo una por equipo');
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
  assert.equal(M.validar({}, {}, [], { t: 'equipo', eq: 'L', jugadores: [{ num: 1, cap: true, lib: true }, ...[2, 3, 4, 5, 6, 7].map((num) => ({ num }))] }), null, 'el líbero puede ser capitán (FIVB regla 5, desde 2022)');
  assert.match(mal({ t: 'equipo', eq: 'L', jugadores: [{ num: 1, lib: true }, { num: 2, lib: true }, { num: 3, lib: true }] }), /2 líberos/);
  const p = preparado();
  const st = M.reproducir({}, {}, p.ev.slice(0, 2));
  assert.equal(st.equipos.L.jugadores.length, 12);
  assert.match(M.validar({}, {}, p.ev.slice(0, 3), { t: 'alineacion', eq: 'L', jugadores: [1, 2, 3, 4, 5, 12] }), /líbero/);
  assert.match(M.validar({}, {}, p.ev.slice(0, 3), { t: 'alineacion', eq: 'L', jugadores: [1, 2, 3, 4, 5] }), /6 jugadores/);
});

test('dorsales: de 0 a 99 y el 00 (distinto del 0); el resto no vale', () => {
  const eq = (nums) => M.validar({}, {}, [], { t: 'equipo', eq: 'L', jugadores: nums.map((num) => ({ num, nombre: 'X' + num })) });
  assert.equal(eq(['0', '00', '1', '99', 7, '08']), null, '0, 00, 1, 99, 7 y "08" valen');
  for (const mal of ['100', '-1', 'A', '', ' ', '1.5', 120, null]) assert.match(eq(['1', mal]), /Dorsal no válido/, `rechaza ${JSON.stringify(mal)}`);
  assert.match(eq(['7', '07']), /repetidos/, '"07" es el mismo dorsal que "7"');
  assert.equal(eq(['0', '00']), null, '0 y 00 son distintos');
  // Se juega con el 00 y el 0 a la vez
  const ev = [{ t: 'equipo', eq: 'L', jugadores: ['00', '0', '1', '2', '3', '4', '5'].map((num, i) => ({ num, nombre: 'L' + num, cap: i === 2 })) },
    { t: 'equipo', eq: 'V', jugadores: [1, 2, 3, 4, 5, 6].map((num) => ({ num, nombre: 'V' + num })) },
    { t: 'sorteo', saca: 'L', izq: 'L' }, { t: 'alineacion', eq: 'L', jugadores: ['00', '1', '2', '3', '4', '5'] }, { t: 'alineacion', eq: 'V', jugadores: [1, 2, 3, 4, 5, 6] }, { t: 'inicioSet', h: h() }];
  assert.equal(M.validar({}, {}, ev, { t: 'sust', eq: 'L', sale: '00', entra: '0' }), null, 'sale el 00 y entra el 0');
  const st = M.reproducir({}, {}, [...ev, { t: 'sust', eq: 'L', sale: '00', entra: '0', h: h() }]);
  assert.deepEqual(M.setActual(st).rot.L, ['0', '1', '2', '3', '4', '5']);
  assert.equal(M.validar({}, {}, ev, { t: 'sancion', eq: 'L', quien: '00', tipo: 'amonestacion' }), null, 'sanción al 00');
});

test('deshacer = reproducir sin el último suceso', () => {
  const p = preparado();
  puntos(p, 'V', 3); p.add({ t: 'sust', eq: 'L', sale: 3, entra: 7 });
  const antes = M.reproducir({}, {}, p.ev.slice(0, -1));
  assert.deepEqual(M.setActual(antes).rot.L, S([1, 2, 3, 4, 5, 6]));
  assert.deepEqual(M.setActual(antes).puntos, { L: 0, V: 3 });
});

test('sin líbero (infantil): no se puede inscribir ni usar', () => {
  const cfg = { liberos: false };
  assert.match(M.validar(cfg, {}, [], { t: 'equipo', eq: 'L', jugadores: [{ num: 1 }, { num: 12, lib: true }] }), /no hay líbero/);
  const p = preparado();   // con líbero, para comprobar que el motor lo bloquea también en juego si se desactiva
  assert.equal(M.validar({ liberos: true }, {}, p.ev, { t: 'liberoEntra', eq: 'V', libero: 12, sale: 5 }), null);
});

test('set obligatorio: titulares sin cambio cuentan; el set en juego no; marcas a mano mandan', () => {
  const p = preparado({ setObligatorio: true });
  p.add({ t: 'sust', eq: 'L', sale: 3, entra: 7 });
  let c = M.setsCompletos(p.st());
  assert.equal(c.L['1'].sets[0].completo, false, 'mientras el set está en juego no cuenta');
  puntos(p, 'L', 25);
  c = M.setsCompletos(p.st());
  assert.equal(c.L['1'].cumple, true, 'titular sin cambio: set completo');
  assert.equal(c.L['3'].cumple, false, 'el titular cambiado no completa el set');
  assert.equal(c.L['7'].cumple, false, 'el suplente no completa el set');
  assert.equal(c.L['8'].cumple, false, 'quien no juega no lo cumple');
  assert.equal(c.V['6'].cumple, true);
  // Corrección a mano: al 7 se le da por bueno (cambio especial) y al 1 se le quita
  p.add({ t: 'setCompleto', eq: 'L', num: 7, set: 1, si: true }); p.add({ t: 'setCompleto', eq: 'L', num: 1, set: 1, si: false });
  c = M.setsCompletos(p.st());
  assert.equal(c.L['7'].cumple, true); assert.equal(c.L['7'].sets[0].mano, true);
  assert.equal(c.L['1'].cumple, false);
  assert.match(p.falla({ t: 'setCompleto', eq: 'L', num: 7, set: 3, si: true }), /no se ha jugado/);
  assert.match(p.falla({ t: 'setCompleto', eq: 'L', num: 55, set: 1, si: true }), /no está en el acta/);
});

test('repetición: sin punto, sin cambio de saque, anotada', () => {
  const p = preparado();
  p.add({ t: 'punto', eq: 'L' }); p.add({ t: 'repeticion' });
  const s = set(p);
  assert.deepEqual(s.puntos, { L: 1, V: 0 }); assert.equal(s.saque, 'L');
  assert.deepEqual([s.repeticiones[0].a, s.repeticiones[0].b], [1, 0]);
});

test('líbero que no puede seguir: entra el otro líbero o se redesigna a uno del banquillo', () => {
  const p = preparado();
  // L tiene 2 líberos (12 y 13): el 12 en pista se lesiona → le sustituye directamente el 13 y el 12 no vuelve
  p.add({ t: 'liberoEntra', eq: 'L', libero: 12, sale: 6 }); p.add({ t: 'punto', eq: 'V' });
  p.add({ t: 'liberoNoPuede', eq: 'L', libero: 12 });
  let st = p.st(), s = M.setActual(st);
  assert.equal(s.libero.L.num, '13'); assert.ok(st.fueraPartido.L.has('12'));
  assert.match(p.falla({ t: 'liberoEntra', eq: 'L', libero: 12, sale: 5 }), /no puede jugar|Ya hay un líbero/);
  // V tiene un solo líbero (12): no puede seguir y se redesigna al 7 (en el banquillo)
  assert.match(p.falla({ t: 'liberoNoPuede', eq: 'V', libero: 12, nuevo: 3 }), /está en pista/);
  assert.match(p.falla({ t: 'liberoNoPuede', eq: 'V', libero: 12, nuevo: 1 }), /está en pista|capitán/);
  p.add({ t: 'liberoNoPuede', eq: 'V', libero: 12, nuevo: 7 });
  st = p.st();
  assert.equal(st.equipos.V.jugadores.find((j) => j.num === '7').lib, true, 'el 7 pasa a ser líbero');
  assert.match(p.falla({ t: 'sust', eq: 'V', sale: 3, entra: 7 }), /líbero/, 'ya no puede entrar por sustitución');
  p.add({ t: 'punto', eq: 'L' });
  p.add({ t: 'liberoEntra', eq: 'V', libero: 7, sale: 6 });
  assert.equal(M.setActual(p.st()).libero.V.num, '7');
  assert.equal(p.st().liberosFuera.V[0].nuevo, '7');
});

test('líbero en pista: la excepcional no vale para el que está fuera por el líbero; el sancionado sí se sustituye', () => {
  const p = preparado();
  p.add({ t: 'liberoEntra', eq: 'V', libero: 12, sale: 5 });
  assert.match(p.falla({ t: 'sust', eq: 'V', sale: 5, entra: 7, tipo: 'excepcional' }), /fuera por el líbero/);
  // El 5 (fuera por el líbero) es expulsado: hay que sustituirlo y el líbero sigue, ahora por el que entra
  p.add({ t: 'sancion', eq: 'V', quien: 5, tipo: 'expulsion' });
  assert.match(p.falla({ t: 'punto', eq: 'L' }), /sustituir/);
  p.add({ t: 'sust', eq: 'V', sale: 5, entra: 7 });
  const s = M.setActual(p.st());
  assert.equal(s.libero.V.por, '7'); assert.equal(s.rot.V[4], '7'); assert.deepEqual(M.enPista(s, 'V'), S([1, 2, 3, 4, 12, 6]));
  p.add({ t: 'punto', eq: 'L' });
});

test('falta de rotación: punto y saque al rival, anotada', () => {
  const p = preparado();
  p.add({ t: 'faltaRotacion', eq: 'L' });   // L sacaba
  const st = p.st(), s = M.setActual(st);
  assert.deepEqual(s.puntos, { L: 0, V: 1 }); assert.equal(s.saque, 'V'); assert.equal(st.faltasRotacion.length, 1); assert.equal(s.progreso[0].motivo, 'rotacion');
});

test('castigo entre sets: el punto se da al empezar el set siguiente', () => {
  const p = preparado();
  puntos(p, 'L', 25);
  p.add({ t: 'sancion', eq: 'V', quien: 'E', tipo: 'castigo' });
  assert.equal(M.setActual(p.st()).puntos.L, 0, 'entre sets todavía no cuenta');
  p.add({ t: 'alineacion', eq: 'L', jugadores: [1, 2, 3, 4, 5, 6] }); p.add({ t: 'alineacion', eq: 'V', jugadores: [1, 2, 3, 4, 5, 6] }); p.add({ t: 'inicioSet' });
  const s = M.setActual(p.st());
  assert.deepEqual(s.puntos, { L: 1, V: 0 }); assert.equal(s.saque, 'L', 'y el saque');
});

test('incomparecencia: 3-0 con 25-0; equipo incompleto a mitad: el rival gana lo que falta', () => {
  const p = preparado();
  puntos(p, 'L', 10); puntos(p, 'V', 12);
  p.add({ t: 'incompleto', eq: 'L', motivo: 'incompleto' });
  let st = p.st();
  assert.equal(st.fase, 'fin'); assert.equal(st.ganados.V, 3); assert.equal(st.ganados.L, 0);
  assert.deepEqual(st.sets[0].puntos, { L: 10, V: 25 }, 'el set en juego: el rival suma lo que le falta');
  assert.deepEqual(st.sets[1].puntos, { L: 0, V: 25 }); assert.equal(st.incompleto.motivo, 'incompleto');
  assert.ok(p.falla({ t: 'punto', eq: 'L' }));
  // Incomparecencia antes de empezar
  const ev = [plantilla('L'), plantilla('V'), { t: 'incompleto', eq: 'V', motivo: 'incomparecencia' }];
  st = M.reproducir({}, {}, ev);
  assert.equal(st.ganados.L, 3); assert.deepEqual(st.sets.map((x) => `${x.puntos.L}-${x.puntos.V}`), ['25-0', '25-0', '25-0']);
  assert.equal(M.resultados(st).ganador, 'L');
  // Incompleto con el set ajustado: 24-23 → el rival necesita 2 de ventaja
  const p2 = preparado(); puntos(p2, 'L', 24); puntos(p2, 'V', 23); p2.add({ t: 'incompleto', eq: 'L' });
  assert.deepEqual(p2.st().sets[0].puntos, { L: 24, V: 26 });
});

test('golden set: después del partido, a 15 con sorteo y cambio a los 8; no cambia el resultado del partido', () => {
  const p = preparado({ mejorDe: 3, puntosSet: 5, puntosDecisivo: 15 });
  assert.match(p.falla({ t: 'goldenSet' }), /cuando el partido ha acabado/);
  const alin = () => { p.add({ t: 'alineacion', eq: 'L', jugadores: [1, 2, 3, 4, 5, 6] }); p.add({ t: 'alineacion', eq: 'V', jugadores: [1, 2, 3, 4, 5, 6] }); };
  puntos(p, 'L', 5); alin(); p.add({ t: 'inicioSet' }); puntos(p, 'L', 5);
  let st = p.st(); assert.equal(st.fase, 'fin'); assert.deepEqual(st.ganados, { L: 2, V: 0 });
  p.add({ t: 'goldenSet' });
  st = p.st(); assert.equal(st.fase, 'entreSets'); const g = M.setActual(st); assert.ok(g.golden && g.decisivo); assert.equal(g.n, 3);
  alin(); assert.match(p.falla({ t: 'inicioSet' }), /sorteo/);
  p.add({ t: 'sorteo', saca: 'V', izq: 'L' }); p.add({ t: 'inicioSet' });
  puntos(p, 'V', 8); assert.equal(M.setActual(p.st()).izq, 'V', 'cambio de campo a los 8');
  puntos(p, 'V', 7);
  st = p.st(); assert.equal(st.fase, 'fin'); assert.deepEqual(st.golden, { set: 3, ganador: 'V' }); assert.deepEqual(st.ganados, { L: 2, V: 0 }, 'el partido sigue 2-0');
  const r = M.resultados(st); assert.equal(r.filas.length, 2); assert.equal(r.ganador, 'L'); assert.equal(r.golden.ganador, 'V'); assert.deepEqual(r.golden.puntos, { L: 0, V: 15 });
  assert.match(p.falla({ t: 'goldenSet' }), /ya se ha jugado/);
});

test('capitán en juego: aviso cuando el capitán sale (si no es líbero), marca y se borra al volver', () => {
  const p = preparado();   // capitán: el 1 de cada equipo; L tiene líberos 12 y 13
  assert.equal(M.necesitaCapitanJuego(p.st(), 'L'), false, 'con el capitán en pista, no');
  assert.match(p.falla({ t: 'capitanJuego', eq: 'L', num: 2 }), /está en pista: él es el capitán/);
  p.add({ t: 'sust', eq: 'L', sale: 1, entra: 7 });
  assert.equal(M.necesitaCapitanJuego(p.st(), 'L'), true, 'sale el capitán: hay que marcar capitán en juego');
  assert.match(p.falla({ t: 'capitanJuego', eq: 'L', num: 8 }), /no está en pista/);
  p.add({ t: 'capitanJuego', eq: 'L', num: 3 });
  let s = set(p); assert.equal(s.capJuego.L, '3'); assert.equal(M.necesitaCapitanJuego(p.st(), 'L'), false);
  p.add({ t: 'sust', eq: 'L', sale: 3, entra: 8 });
  s = set(p); assert.equal(s.capJuego.L, null, 'si sale el capitán en juego, se borra'); assert.equal(M.necesitaCapitanJuego(p.st(), 'L'), true);
  p.add({ t: 'capitanJuego', eq: 'L', num: 2 });
  p.add({ t: 'punto', eq: 'L' }); p.add({ t: 'sust', eq: 'L', sale: 7, entra: 1 });
  s = set(p); assert.equal(s.capJuego.L, null, 'vuelve el capitán: se borra'); assert.equal(M.necesitaCapitanJuego(p.st(), 'L'), false);
  assert.equal(p.st().capitanesJuego.length, 2);
});

test('capitán líbero: cuando sale de pista no se pide capitán en juego', () => {
  const ev = [{ t: 'equipo', eq: 'L', nombre: 'L', jugadores: [1, 2, 3, 4, 5, 6, 7].map((num) => ({ num })).concat([{ num: 12, lib: true, cap: true }]) },
    { t: 'equipo', eq: 'V', nombre: 'V', jugadores: [1, 2, 3, 4, 5, 6].map((num) => ({ num, cap: num === 1 })) },
    { t: 'sorteo', saca: 'V', izq: 'L' }, { t: 'alineacion', eq: 'L', jugadores: [1, 2, 3, 4, 5, 6] }, { t: 'alineacion', eq: 'V', jugadores: [1, 2, 3, 4, 5, 6] }, { t: 'inicioSet' }];
  assert.equal(M.necesitaCapitanJuego(M.reproducir({}, {}, ev), 'L'), false, 'capitán líbero en el banquillo: sin aviso');
});

test('normativa 2025-2028 / FCVB 2026-27', () => {
  // Rally completo: un castigo también cuenta (FIVB 6.1.3): el líbero puede volver a cambiar después
  let p = preparado();
  p.add({ t: 'punto', eq: 'L' }); p.add({ t: 'punto', eq: 'V' });   // V rota y saca; L recibe
  p.add({ t: 'liberoEntra', eq: 'L', libero: 12, sale: set(p).rot.L[5] });   // VI: al rotar pasa a V, sigue en la zaga
  assert.match(p.falla({ t: 'liberoSale', eq: 'L' }), /rally completo/);
  p.add({ t: 'sancion', eq: 'V', quien: 2, tipo: 'castigo' });
  assert.equal(p.falla({ t: 'liberoSale', eq: 'L' }), null, 'tras un castigo ya hay rally completo');
  // Máximo de jugadores: 14 con líbero, 12 sin líbero
  const jug = (n) => Array.from({ length: n }, (_, i) => ({ num: i + 1 }));
  assert.match(M.validar({}, {}, [], { t: 'equipo', eq: 'L', jugadores: jug(15) }), /Como mucho 14/);
  assert.equal(M.validar({}, {}, [], { t: 'equipo', eq: 'L', jugadores: jug(14) }), null);
  assert.match(M.validar({ liberos: false }, {}, [], { t: 'equipo', eq: 'L', jugadores: jug(13) }), /Como mucho 12/);
  assert.match(M.validar({}, {}, [], { t: 'equipo', eq: 'L', jugadores: jug(12), oficiales: [{ rol: 'E', nombre: 'a' }, { rol: 'E2', nombre: 'b' }, { rol: 'E3', nombre: 'c' }, { rol: 'F', nombre: 'd' }, { rol: 'M', nombre: 'e' }] }), /3 oficiales/);
  // Redesignación con 2 líberos: no, mientras el otro pueda jugar (FIVB 19.4.3.1)
  p = preparado();
  assert.match(p.falla({ t: 'liberoNoPuede', eq: 'L', libero: 12, nuevo: 8 }), /Queda el otro líbero, el 13/);
  p.add({ t: 'liberoNoPuede', eq: 'L', libero: 12 });
  p.add({ t: 'liberoNoPuede', eq: 'L', libero: 13, nuevo: 8 });
  assert.ok(p.st().equipos.L.jugadores.find((j) => j.num === '8').lib, 'sin ninguno disponible, sí');
  // Falta de rotación con anulación de puntos (FIVB 7.7.2)
  p = preparado();
  puntos(p, 'L', 3); p.add({ t: 'punto', eq: 'V' }); puntos(p, 'V', 2); p.add({ t: 'punto', eq: 'L' });   // L 4 - V 3
  assert.match(p.falla({ t: 'faltaRotacion', eq: 'L', desde: 9 }), /de 0 a 4/);
  p.add({ t: 'faltaRotacion', eq: 'L', desde: 2 });
  let s = set(p); assert.deepEqual(s.puntos, { L: 2, V: 4 }, 'se anulan los 2 puntos de L desde la falta y V gana 1');
  assert.equal(s.progreso.filter((x) => x.anulado).length, 2); assert.equal(p.st().faltasRotacion[0].anulados, 2);
  p.add({ t: 'faltaRotacion', eq: 'V' }); assert.deepEqual(set(p).puntos, { L: 3, V: 4 }, 'sin momento: solo punto al rival');
  // Excepcionales: cuentan en el total del acta, no en el límite
  p = preparado(); p.add({ t: 'sust', eq: 'L', sale: 3, entra: 8, tipo: 'excepcional' });
  assert.equal(set(p).nSust.L, 0); assert.equal(M.resultados(p.st()).filas[0].L.sust, 1);
});
