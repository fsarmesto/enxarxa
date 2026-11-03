// Simulación masiva del motor del acta: miles de partidos al azar con todo tipo de acciones (puntos, tiempos, cambios,
// líberos, sanciones, repeticiones, deshacer…), solo las que el motor acepta, y después de cada una se comprueban las
// reglas que nunca se pueden romper. Uso: node tools/prueba-acta-azar.mjs [partidos] [semilla]
import { createRequire } from 'node:module';
const M = createRequire(import.meta.url)('../docs/acta/motor.js');
const N = +process.argv[2] || 2000;
let semilla = +process.argv[3] || 12345;
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
const elige = (a) => a[Math.floor(azar() * a.length)];
const OTRO = M.OTRO;

const fallos = [];
const falla = (msg, ctx) => { if (fallos.length < 25) fallos.push(`${msg} · ${ctx}`); };

function comprobar(cfg, ev, st, ctx) {
  const s = M.setActual(st);
  if (st.ganados.L > Math.ceil(st.cfg.mejorDe / 2) || st.ganados.V > Math.ceil(st.cfg.mejorDe / 2)) falla('demasiados sets ganados', ctx);
  if ((st.fase === 'fin') !== (Math.max(st.ganados.L, st.ganados.V) === Math.ceil(st.cfg.mejorDe / 2))) falla('fase fin incoherente', ctx);
  for (const x of st.sets) {
    if (x.progreso.length !== x.puntos.L + x.puntos.V) falla('progreso ≠ puntos', ctx);
    if (x.ganador) {
      const obj = x.decisivo ? st.cfg.puntosDecisivo : st.cfg.puntosSet, g = x.puntos[x.ganador], p = x.puntos[OTRO(x.ganador)];
      if (g < obj || g - p < 2 || (g > obj && g - p !== 2)) falla(`set ${x.n} acabado mal ${x.puntos.L}-${x.puntos.V}`, ctx);
    } else if (x.inicio) {
      const a = x.puntos.L, b = x.puntos.V, obj = x.decisivo ? st.cfg.puntosDecisivo : st.cfg.puntosSet;
      if ((a >= obj || b >= obj) && Math.abs(a - b) >= 2) falla(`set ${x.n} debería haber acabado ${a}-${b}`, ctx);
    }
    for (const eq of ['L', 'V']) {
      if (x.nSust[eq] > st.cfg.sustituciones) falla('más cambios de los permitidos', ctx);
      if (x.tiempos[eq].length > st.cfg.tiempos) falla('más tiempos de los permitidos', ctx);
    }
    if (x.decisivo && x.inicio && Math.max(x.puntos.L, x.puntos.V) >= st.cfg.cambioDecisivo && !x.cambioHecho) falla('set decisivo sin cambio de campo a los 8', ctx);
  }
  if (st.fase === 'juego') {
    for (const eq of ['L', 'V']) {
      const r = s.rot[eq], pista = M.enPista(s, eq), l = s.libero[eq];
      if (new Set(r).size !== 6 || r.some((n) => !n)) falla('rotación con huecos o repetidos', ctx);
      if (new Set(pista).size !== 6) falla('jugador repetido en pista', ctx);
      for (const n of r) {
        const j = st.equipos[eq].jugadores.find((x) => x.num === n);
        if (!j) falla(`en pista alguien que no está en el acta (${n})`, ctx);
        else if (j.lib && !(l && l.num === n)) falla(`líbero ${n} en pista como jugador normal`, ctx);
        if (st.descalificados[eq].has(n) && !s.pendienteSust[eq].includes(n)) falla(`descalificado ${n} en pista`, ctx);
        if (s.expulsados[eq].has(n) && !s.pendienteSust[eq].includes(n)) falla(`expulsado ${n} en pista`, ctx);
        if (st.fueraPartido[eq].has(n) && !s.pendienteSust[eq].includes(n) && !(l && l.por === n)) falla(`jugador fuera del partido ${n} en pista`, ctx);
      }
      if (l) {
        if (![0, 4, 5].includes(l.pos)) falla(`líbero en la delantera (posición ${l.pos + 1})`, ctx);
        if (s.saque === eq && l.pos === 0) falla('el líbero saca', ctx);
        if (r[l.pos] !== l.por) falla('el líbero no está en el sitio de su jugador', ctx);
      }
    }
    if (!s.saque) falla('nadie saca', ctx);
  }
  const r = M.resultados(st);
  if (r.total.L.gana !== st.ganados.L || r.total.V.gana !== st.ganados.V) falla('resultados ≠ sets ganados', ctx);
}

const plantilla = (eq, nLib) => ({ t: 'equipo', eq, nombre: eq, jugadores: [...Array.from({ length: 10 }, (_, i) => ({ num: String(i + 1), nombre: eq + (i + 1), cap: i === 0 })), ...Array.from({ length: nLib }, (_, i) => ({ num: String(20 + i), nombre: 'Lib' + i, lib: true })), { num: '00', nombre: eq + '00' }] });
let acciones = 0, rechazadas = 0, partidos = 0, deshechas = 0;
const t0 = Date.now();
for (let p = 0; p < N; p++) {
  const cfg = { mejorDe: elige([5, 5, 3]), setObligatorio: azar() < 0.3 };
  const ev = [plantilla('L', elige([0, 1, 2])), plantilla('V', elige([0, 1, 2]))];
  let h = Date.parse('2026-11-07T10:00:00Z');
  const add = (e) => { const x = { ...e, h: new Date((h += 15000)).toISOString() }; const m = M.validar(cfg, {}, ev, x); acciones++; if (m) { rechazadas++; return false; } ev.push(x); return true; };
  const alinear = (st) => { for (const eq of ['L', 'V']) { const libres = st.equipos[eq].jugadores.filter((j) => !j.lib && !st.descalificados[eq].has(j.num) && !st.fueraPartido[eq].has(j.num)).map((j) => j.num); const a = []; while (a.length < 6 && libres.length) a.push(libres.splice(Math.floor(azar() * libres.length), 1)[0]); add({ t: 'alineacion', eq, jugadores: a }); } };
  add({ t: 'sorteo', saca: elige(['L', 'V']), izq: elige(['L', 'V']) });
  let st = M.reproducir(cfg, {}, ev); alinear(st); add({ t: 'inicioSet' });
  for (let paso = 0; paso < 900; paso++) {
    st = M.reproducir(cfg, {}, ev);
    const ctx = `partido ${p} paso ${paso} ${JSON.stringify(ev[ev.length - 1]).slice(0, 90)}`;
    comprobar(cfg, ev, st, ctx);
    if (st.fase === 'fin') break;
    if (st.fase === 'entreSets') { if (azar() < 0.1) add({ t: 'sancion', eq: elige(['L', 'V']), quien: 'E', tipo: elige(['castigo', 'amonestacion', 'avisoRetraso', 'castigoRetraso']) }); const s = M.setActual(st); if (s.decisivo && !s.saqueInicial) add({ t: 'sorteo', saca: elige(['L', 'V']), izq: elige(['L', 'V']) }); alinear(st); if (!add({ t: 'inicioSet' })) { falla('no se puede empezar el set', ctx); break; } continue; }
    const s = M.setActual(st), eq = elige(['L', 'V']), x = azar();
    // Deshacer: el estado tiene que ser exactamente el de antes del último suceso
    if (x < 0.03 && ev.length > 6) {
      const antes = JSON.stringify(M.resultados(M.reproducir(cfg, {}, ev.slice(0, -1))));
      const ult = ev.pop(); deshechas++;
      if (JSON.stringify(M.resultados(M.reproducir(cfg, {}, ev))) !== antes) falla('deshacer no deja el estado anterior', ctx);
      if (azar() < 0.5) ev.push(ult);   // a veces se rehace
      continue;
    }
    if (s.pendienteSust.L.length || s.pendienteSust.V.length) {   // expulsado: hay que sustituirlo
      const e2 = s.pendienteSust.L.length ? 'L' : 'V', sale = s.pendienteSust[e2][0];
      const banco = st.equipos[e2].jugadores.filter((j) => !j.lib && !s.rot[e2].includes(j.num)).map((j) => j.num);
      if (!banco.some((n) => add({ t: 'sust', eq: e2, sale, entra: n })) && !banco.some((n) => add({ t: 'sust', eq: e2, sale, entra: n, tipo: 'excepcional' }))) { falla('expulsado sin forma de sustituirlo (equipo incompleto)', ctx); break; }
      continue;
    }
    if (x < 0.78) add({ t: 'punto', eq });
    else if (x < 0.82) add({ t: 'tiempo', eq });
    else if (x < 0.90) { const sale = elige(s.rot[eq]), entra = elige(st.equipos[eq].jugadores.map((j) => j.num)); add({ t: 'sust', eq, sale, entra, ...(azar() < 0.05 ? { tipo: 'excepcional' } : {}) }); }
    else if (x < 0.96) { const libs = st.equipos[eq].jugadores.filter((j) => j.lib).map((j) => j.num); if (libs.length) { if (s.libero[eq] && azar() < 0.5) add({ t: 'liberoSale', eq }); else add({ t: 'liberoEntra', eq, libero: elige(libs), sale: s.libero[eq] && azar() < 0.3 ? s.libero[eq].num : elige(s.rot[eq]) }); } }
    else if (x < 0.975) add({ t: 'sancion', eq, quien: elige(['equipo', 'E', ...s.rot[eq], ...st.equipos[eq].jugadores.map((j) => j.num)]), tipo: elige(['amonestacion', 'castigo', 'castigo', 'avisoRetraso', 'castigoRetraso', 'expulsion', 'descalificacion']) });
    else if (x < 0.985) add({ t: 'repeticion' });
    else if (x < 0.99) { const libs = st.equipos[eq].jugadores.filter((j) => j.lib && !st.fueraPartido[eq].has(j.num)).map((j) => j.num); if (libs.length) add({ t: 'liberoNoPuede', eq, libero: elige(libs), ...(azar() < 0.6 ? { nuevo: elige(st.equipos[eq].jugadores.map((j) => j.num)) } : {}) }); }
    else if (x < 0.993) add({ t: 'impropia', eq });
    else if (x < 0.998) add({ t: 'faltaRotacion', eq });
    else add({ t: 'incompleto', eq, motivo: 'incompleto' });
  }
  partidos++;
}
console.log(`${partidos} partidos simulados · ${acciones} acciones probadas (${rechazadas} rechazadas por el motor) · ${deshechas} deshacer · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (fallos.length) { console.log(`\n${fallos.length} FALLOS:`); for (const f of fallos) console.log(' - ' + f); process.exit(1); }
console.log('Ninguna regla rota.');
