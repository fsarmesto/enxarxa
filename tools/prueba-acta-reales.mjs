// Reproduce en el motor del acta los partidos reales de la MLV (liga profesional de EE. UU.) y compara jugada a jugada con la
// realidad: el sacador de cada punto, el marcador de cada set y el resultado. Datos públicos de github.com/awosoga/volleydata
// (registro de sucesos del acta + punto a punto). Descarga, en una carpeta aparte:
//   curl -LO https://github.com/awosoga/volleydata/releases/download/pvf-events-log/pvf_events_log_2026.csv
//   curl -LO https://github.com/awosoga/volleydata/releases/download/pvf-pbp/pvf_pbp_2026.csv
// Uso, desde la raíz del repo: node tools/prueba-acta-reales.mjs <carpeta con los CSV> [--detalle]
// 3-nov-2026: 114 de 115 partidos idénticos; el sacador coincide en el 99,5 % de 20.139 puntos y las diferencias son
// incoherencias entre los 2 archivos reales (o un set con correcciones a mano del anotador real).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const M = createRequire(import.meta.url)('../docs/acta/motor.js');
const DIR = process.argv[2] || '../datos-reales', DET = process.argv.includes('--detalle');

function csv(file) {   // CSV sencillo con comillas
  const txt = fs.readFileSync(file, 'utf8'), rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [h, ...rest] = rows; return rest.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] === 'NA' ? null : r[i]])));
}
const EV = csv(`${DIR}/pvf_events_log_2026.csv`), PBP = csv(`${DIR}/pvf_pbp_2026.csv`);
const EQ = { home: 'L', away: 'V' };
const porPartido = (rows) => rows.reduce((m, r) => ((m[r.match_id] ??= []).push(r), m), {});
const evs = porPartido(EV), pbps = porPartido(PBP);

// Sacador real de cada punto: la primera acción "S" de cada (set, punto).
function sacadores(rows) {
  const m = new Map();
  for (const r of rows) if (r.action === 'S' && !m.has(`${r.set}|${r.point_number}`)) m.set(`${r.set}|${r.point_number}`, { eq: EQ[r.team_involved], num: r.jersey_number });
  return m;
}

const tot = { partidos: 0, ok: 0, puntos: 0, sacadorBien: 0, sacadorMal: 0, setsBien: 0, setsMal: 0, rechazos: {}, ejemplos: {} };
const anota = (tipo, ej) => { tot.rechazos[tipo] = (tot.rechazos[tipo] || 0) + 1; (tot.ejemplos[tipo] ??= []).push(ej); };

for (const [id, rows] of Object.entries(evs)) {
  tot.partidos++;
  const cfg = { sustituciones: 8 };
  const saca = sacadores(pbps[id] || []);
  // Plantillas: todos los dorsales que salen; líberos = los que entran como líbero.
  const nums = { L: new Set(), V: new Set() }, libs = { L: new Set(), V: new Set() };
  for (const r of rows) {
    for (const k of [1, 2, 3, 4, 5, 6]) { if (r[`home_team_starter_position_${k}`]) nums.L.add(r[`home_team_starter_position_${k}`]); if (r[`away_team_starter_position_${k}`]) nums.V.add(r[`away_team_starter_position_${k}`]); }
    const e = EQ[r.team_involved]; if (!e) continue;
    if (r.event_type === 'libero') { libs[e].add(r.libero_jersey_number); nums[e].add(r.libero_substitute_jersey_number); }
    if (r.event_type === 'substitution') { nums[e].add(r.substitute_in_jersey_number); nums[e].add(r.substitute_out_jersey_number); }
  }
  for (const r of pbps[id] || []) { const e = EQ[r.team_involved]; if (e && r.jersey_number && !libs[e].has(r.jersey_number)) nums[e].add(r.jersey_number); }
  for (const e of ['L', 'V']) for (const l of libs[e]) nums[e].delete(l);
  const ev = [];
  const h = () => new Date(Date.parse('2026-05-01T18:00:00Z') + ev.length * 20000).toISOString();
  const add = (e, ctx) => { const m = M.validar(cfg, {}, ev, { ...e, h: h() }); if (m) { anota(`${e.t}: ${m.replace(/\d+/g, 'N')}`, `${id} set ${ctx.set} ${JSON.stringify(e)}`); return false; } ev.push({ ...e, h: h() }); return true; };
  for (const e of ['L', 'V']) add({ t: 'equipo', eq: e, nombre: e, jugadores: [...[...nums[e]].map((num) => ({ num, nombre: 'J' + num })), ...[...libs[e]].map((num) => ({ num, nombre: 'Lib' + num, lib: true }))] }, { set: 0 });
  let setAct = 0, puntoSet = 0, ultimoPunto = -1, rotos = false;
  for (const r of rows) {
    const set = +r.set;
    if (set !== setAct) {   // set nuevo: sorteo si toca, alineaciones e inicio
      setAct = set; puntoSet = 0;
      const st = M.reproducir(cfg, {}, ev), s = M.setActual(st);
      if (set === 1) add({ t: 'sorteo', saca: EQ[r.opening_set_serving_team], izq: EQ[r.opening_set_left_side_team] }, { set });
      else if (s.decisivo) add({ t: 'sorteo', saca: EQ[r.deciding_set_serving_team], izq: EQ[r.deciding_set_left_side_team] }, { set });
      for (const [e, p] of [['L', 'home'], ['V', 'away']]) add({ t: 'alineacion', eq: e, jugadores: [1, 2, 3, 4, 5, 6].map((k) => r[`${p}_team_starter_position_${k}`]) }, { set });
      if (!add({ t: 'inicioSet' }, { set })) { rotos = true; break; }
    }
    const e = EQ[r.team_involved];
    switch (r.event_type) {
      case 'rally': {
        if (!r.rally_point_winner) { add({ t: 'repeticion' }, { set }); break; }   // jugada repetida: no es un punto
        puntoSet++;
        const st = M.reproducir(cfg, {}, ev), s = M.setActual(st), real = saca.get(`${set}|${puntoSet}`);
        if (real) {
          tot.puntos++;
          const nuestro = { eq: s.saque, num: M.enPista(s, s.saque)[0] };
          if (nuestro.eq === real.eq && nuestro.num === real.num) tot.sacadorBien++;
          else { tot.sacadorMal++; anota('sacador distinto', `${id} set ${set} punto ${puntoSet}: real ${real.eq}${real.num}, nuestro ${nuestro.eq}${nuestro.num}`); }
        }
        if (add({ t: 'punto', eq: EQ[r.rally_point_winner] }, { set })) ultimoPunto = ev.length - 1;
        break;
      }
      case 'libero':
        if (r.libero_enters === 'TRUE') {
          const s = M.setActual(M.reproducir(cfg, {}, ev));
          // Ya en pista el otro líbero: es un cambio de líbero por líbero
          if (s.libero[e] && s.libero[e].num !== r.libero_jersey_number) add({ t: 'liberoEntra', eq: e, libero: r.libero_jersey_number, sale: s.libero[e].num }, { set });
          else add({ t: 'liberoEntra', eq: e, libero: r.libero_jersey_number, sale: r.libero_substitute_jersey_number }, { set });
        } else {
          const s = M.setActual(M.reproducir(cfg, {}, ev));
          if (!s.libero[e]) anota('salida de líbero que nuestro motor ya había hecho sola (al rotar a la delantera)', `${id} set ${set}`);
          else add({ t: 'liberoSale', eq: e }, { set });
        }
        break;
      case 'substitution': add({ t: 'sust', eq: e, sale: r.substitute_out_jersey_number, entra: r.substitute_in_jersey_number, ...(r.is_exceptional === 'TRUE' ? { tipo: 'excepcional' } : {}) }, { set }); break;
      case 'timeout': add({ t: 'tiempo', eq: e }, { set }); break;
      case 'sanction': add({ t: 'sancion', eq: e, quien: r.staff_type === 'assistant' ? 'E2' : r.staff_type === 'coach' ? 'E' : 'equipo', tipo: 'amonestacion' }, { set }); break;
      case 'delay': { const st = M.reproducir(cfg, {}, ev); add({ t: 'sancion', eq: e, quien: 'equipo', tipo: st.avisoRetraso[e] ? 'castigoRetraso' : 'avisoRetraso' }, { set }); break; }
      case 'videoChallenge':
        if (r.challenge_score_change === 'assignToOther' && ultimoPunto === ev.length - 1) { const p = ev.pop(); add({ t: 'punto', eq: M.OTRO(p.eq) }, { set }); ultimoPunto = ev.length - 1; }
        else if (r.challenge_score_change === 'repeatLast' && ultimoPunto === ev.length - 1) { ev.pop(); puntoSet--; add({ t: 'repeticion' }, { set }); }
        break;
      default: break;   // technicalTimeout, manualChange: sin equivalente
    }
  }
  if (rotos) { anota('partido sin reproducir', id); continue; }
  // Marcador de cada set y resultado
  const st = M.reproducir(cfg, {}, ev);
  const reales = new Map(rows.map((r) => [+r.set, { L: +r.set_final_home_score, V: +r.set_final_away_score }]));
  let bien = true;
  for (const [n, real] of reales) {
    const s = st.sets.find((x) => x.n === n);
    if (s && s.puntos.L === real.L && s.puntos.V === real.V) tot.setsBien++;
    else { tot.setsMal++; bien = false; anota('marcador de set distinto', `${id} set ${n}: real ${real.L}-${real.V}, nuestro ${s ? s.puntos.L + '-' + s.puntos.V : '—'}`); }
  }
  if (bien && st.fase === 'fin') tot.ok++;
  else if (st.fase !== 'fin') anota('el partido no acaba en nuestro motor', `${id}: fase ${st.fase}, sets ${st.ganados.L}-${st.ganados.V}`);
}
console.log(`Partidos: ${tot.partidos} · idénticos de principio a fin: ${tot.ok}`);
console.log(`Sacador: ${tot.sacadorBien} de ${tot.puntos} puntos iguales (${(100 * tot.sacadorBien / Math.max(1, tot.puntos)).toFixed(2)} %) · distintos: ${tot.sacadorMal}`);
console.log(`Sets con el mismo marcador: ${tot.setsBien} · distintos: ${tot.setsMal}`);
const orden = Object.entries(tot.rechazos).sort((a, b) => b[1] - a[1]);
console.log(`\nIncidencias (${orden.length} tipos):`);
for (const [k, n] of orden) { console.log(`  ${n}× ${k}`); if (DET) for (const e of tot.ejemplos[k]) console.log(`       · ${e.slice(0, 220)}`); }
