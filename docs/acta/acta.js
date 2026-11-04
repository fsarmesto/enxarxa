// Acta electrónica: pantallas. Las reglas están en motor.js; aquí solo se recogen los sucesos, se validan con el motor
// y se guardan en este dispositivo (localStorage acta:<id>), sin conexión. Desde EnXarxa, un partido designado rellena
// la cabecera (equipos, competición, fecha, pabellón y árbitros).
(() => {
'use strict';
const M = window.ActaMotor;
if (!M) throw new Error('No se ha cargado el motor del acta (motor.js).');   // lo enseña la vigilancia de index.html
const OTRO = M.OTRO;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const POS = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const SANC = { amonestacion: 'Amonestación', castigo: 'Castigo', expulsion: 'Expulsión', descalificacion: 'Descalificación', avisoRetraso: 'Aviso por retraso', castigoRetraso: 'Castigo por retraso', impropia: 'Petición improcedente' };
const FIRMAS = [['capL', 'Capitán local'], ['capV', 'Capitán visitante'], ['aa', 'Anotador ayudante'], ['an', 'Anotador'], ['r2', '2º árbitro'], ['r1', '1er árbitro']];
const FIRMAS_PRE = [['preCapL', 'Capitán local'], ['preEL', 'Entrenador local'], ['preCapV', 'Capitán visitante'], ['preEV', 'Entrenador visitante']];
// Confirmación nativa, traducida si el acta está en catalán (acta-ca.js).
const confirmar = (m) => confirm(window.trActa ? window.trActa(m) : m);
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '');
const titulo = (s) => String(s || '').toLowerCase().replace(/(^|[\s'·(-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

let A = null;          // acta abierta: { id, cfg, datos, ev, paso, creada, actualizada }
let ST = null;         // estado calculado por el motor
let VER = false;       // viendo el acta para imprimir (no se guarda)

/* ---------- Guardar en el dispositivo ---------- */
const clave = (id) => 'acta:' + id;
function guardar() { A.actualizada = new Date().toISOString(); try { localStorage.setItem(clave(A.id), JSON.stringify(A)); } catch (e) { toast('No se ha podido guardar en el dispositivo.'); } }
// Actas guardadas con versiones anteriores: lo que ahora no se acepta y se puede arreglar sin tocar lo anotado se arregla
// al cargarlas. Hoy: jugadores con un dorsal no válido (antes no se comprobaba, p. ej. "544") en un acta que aún no ha
// empezado: se quitan de la plantilla guardada y se dejan aparte (a.quitados) para que salgan en Equipos y se corrijan.
function reparar(a) {
  if (!a || !Array.isArray(a.ev)) return a;
  const empezada = a.ev.some((e) => e.t === 'inicioSet');
  let cambios = false;
  a.ev = a.ev.map((e) => {
    if (e.t !== 'equipo' || !Array.isArray(e.jugadores)) return e;
    const malos = e.jugadores.filter((j) => !M.dorsalValido(j.num));
    if (!malos.length || empezada) return e;
    cambios = true;
    ((a.quitados ??= {})[e.eq] ??= []).push(...malos.map((j) => ({ ...j, num: String(j.num ?? '') })));
    return { ...e, jugadores: e.jugadores.filter((j) => M.dorsalValido(j.num)) };
  });
  if (cambios) { a.paso = 'equipos'; try { localStorage.setItem(clave(a.id), JSON.stringify(a)); } catch (x) {} }
  return a;
}
function actas() {
  const out = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('acta:')) { try { out.push(reparar(JSON.parse(localStorage.getItem(k)))); } catch (e) {} } } } catch (e) {}
  return out.sort((a, b) => String(b.actualizada).localeCompare(String(a.actualizada)));
}
function calcular() { ST = M.reproducir(A.cfg, A.datos, A.ev); return ST; }
let ULT_PUNTO = 0;
function hacer(ev, silencio) {
  if (ev.t === 'punto') {   // doble toque sin querer (muy fácil en tablet): el segundo, si llega antes de 0,25 s, no cuenta (Ferran, 4-nov: con 0,7 s no se podían dar 2 puntos seguidos rápido)
    const ahora = Date.now();
    if (ahora - ULT_PUNTO < (window.ACTA_ANTIRREBOTE ?? 250)) { toast('Doble toque: no se ha contado el segundo punto.'); return 'doble'; }
    ULT_PUNTO = ahora;
  }
  ev = { ...ev, h: ev.h || new Date().toISOString() };
  const m = M.validar(A.cfg, A.datos, A.ev, ev);
  if (m) { if (!silencio) toast(m); return m; }
  A.ev.push(ev); guardar(); pintar(); publicarDirecto(); return null;
}
function toast(msg, ok) { const t = $('toast'); t.textContent = msg; t.className = ok ? 'ok' : ''; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => (t.style.display = 'none'), 3200); }

/* ---------- Hoja (diálogo) ---------- */
function hoja(html, alAbrir) { $('hojaC').innerHTML = html; $('hoja').classList.remove('hidden'); (alAbrir || (() => $('hojaC').querySelector('button,input,select,textarea')?.focus()))(); }
function cerrarHoja() { $('hoja').classList.add('hidden'); $('hojaC').innerHTML = ''; }
$('hoja').addEventListener('click', (e) => { if (e.target.id === 'hoja' || e.target.closest('[data-cerrar]')) cerrarHoja(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('hoja').classList.contains('hidden')) { cerrarHoja(); return; }
  if (!A || !ST || ST.fase !== 'juego' || !$('hoja').classList.contains('hidden') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  const s = M.setActual(ST);
  if (e.key === 'ArrowLeft') { e.preventDefault(); hacer({ t: 'punto', eq: s.izq }); }
  if (e.key === 'ArrowRight') { e.preventDefault(); hacer({ t: 'punto', eq: OTRO(s.izq) }); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); deshacer(); }
});

/* ---------- Pasos ---------- */
function vista() {
  if (!A) return 'inicio';
  if (VER) return 'ver';
  if (ST.fase === 'preparacion') return A.paso || 'datos';
  return { juego: 'juego', entreSets: 'entre', fin: 'final' }[ST.fase];
}
function pasos(on) {
  const P = [['datos', 'Datos'], ['equipos', 'Equipos'], ['sorteo', 'Sorteo y alineación'], ['juego', 'Partido'], ['final', 'Firmas']];
  const i = P.findIndex(([k]) => k === (on === 'entre' ? 'juego' : on));
  return `<div class="pasos">${P.map(([k, t], j) => `<span class="${j === i ? 'on' : j < i ? 'ok' : ''}">${j < i ? '<span aria-hidden="true">✓ </span>' : ''}<span>${esc(t)}</span></span>`).join('')}</div>`;
}
function pintar() {
  try { pintar0(); LISTO = true; window.ACTA_OK = true; window.pepperLoader?.done(); } catch (e) { mostrarError(e); }
}
// Si algo falla al pintar (p. ej. un acta guardada que esta versión no puede abrir) no se queda colgado: se explica qué pasa
// y se puede volver a intentar, ir a Mis actas o descargar los datos de esa acta para no perderlos.
let LISTO = false;
function mostrarError(e) {
  console.error(e);
  window.pepperLoader?.done(); clearInterval(RELOJ);
  const msg = (e && e.message) || String(e);
  window.ACTA_OK = true;   // ya se explica aquí: la vigilancia de index.html no hace falta
  $('app').innerHTML = `<section class="card" role="alert"><h2>No se ha podido abrir</h2>
    <p>${A ? 'Esta acta no se puede mostrar con esta versión.' : 'La página no ha arrancado bien.'} Tus datos siguen guardados en este dispositivo.</p>
    <p class="small muted">Detalle: ${esc(msg)}</p>
    <div class="row"><button class="primary" id="errReintentar">Volver a intentarlo</button>${A ? '<button id="errJson">Descargar los datos de esta acta</button>' : ''}<button class="ghost" id="errMis">Mis actas</button></div></section>`;
  $('errReintentar').onclick = () => location.reload();
  $('errMis').onclick = () => { location.href = location.pathname; };
  if (A) $('errJson').onclick = () => { const b = new Blob([JSON.stringify(A, null, 1)], { type: 'application/json' }); const x = document.createElement('a'); x.href = URL.createObjectURL(b); x.download = `acta-${A.id}.json`; x.click(); };
  LISTO = true;
}
function pintar0() {
  if (A) calcular();
  const v = vista();
  document.body.classList.toggle('vista', v === 'ver');
  $('sub').textContent = A ? `${A.datos.local || 'Local'} – ${A.datos.visitante || 'Visitante'}${A.datos.competicion ? ' · ' + A.datos.competicion : ''}` : 'Prototipo · reglas oficiales FIVB 6x6';
  ({ inicio: pInicio, datos: pDatos, equipos: pEquipos, sorteo: pSorteo, juego: pJuego, entre: pEntre, final: pFinal, ver: pVer })[v]();
}

/* ---------- Inicio ---------- */
let MIOS = null, SB = null;
const sbc = () => (SB ??= supabase.createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY));
async function cargarMios() {
  try {
    const sb = sbc();
    const { data: { session } } = await sb.auth.getSession(); if (!session) { MIOS = []; return; }
    const desde = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10), hasta = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const { data } = await sb.from('matches').select('id, date, time, comp, teams, venue, addr, crew').eq('user_id', session.user.id).gte('date', desde).lte('date', hasta).order('date').order('time');
    MIOS = (data || []).filter((m) => / vs /.test(m.teams || ''));
  } catch (e) { MIOS = []; }
  if (!A) pintar();
}
function pInicio() {
  const lst = actas();
  $('app').innerHTML = `
    <section class="card"><h2>Nueva acta</h2>
      <p class="small muted">Prototipo para la FCVB: el acta en papel sigue siendo la oficial. Todo se guarda en este dispositivo y funciona sin conexión.</p>
      <div class="row"><button class="primary" id="nueva">Acta en blanco</button><label class="btn" style="cursor:pointer">Importar un acta (JSON)<input type="file" id="importar" accept="application/json,.json" class="sr"></label></div>
      ${MIOS === null ? '<p class="small muted" style="margin-top:10px">Buscando tus partidos designados…</p>' : MIOS.length ? `<h3 style="margin:14px 0 6px;font-size:15px">O empieza desde uno de tus partidos</h3>
      <div class="row">${MIOS.map((m) => `<button data-desde="${esc(m.id)}">${esc(m.date.slice(8, 10) + '/' + m.date.slice(5, 7))} ${esc(m.time || '')} · ${esc(titulo(m.teams).replace(' Vs ', ' – '))}</button>`).join('')}</div>` : ''}
    </section>
    ${lst.length ? `<section class="card"><h2>Actas en este dispositivo</h2>${lst.map((a) => {
      let st, r;
      try { st = M.reproducir(a.cfg, a.datos, a.ev); r = M.resultados(st); }
      catch (e) { return `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0"><span><b>${esc(a.datos?.local || 'Local')} – ${esc(a.datos?.visitante || 'Visitante')}</b><br><span class="small" style="color:var(--warn)">No se puede abrir con esta versión: ${esc(e.message)}</span></span><span class="row"><button class="ghost" data-borrar="${esc(a.id)}">Borrar</button></span></div>`; }
      return `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0"><span><b>${esc(a.datos.local || 'Local')} – ${esc(a.datos.visitante || 'Visitante')}</b><br><span class="small muted">${esc(a.datos.fecha || '')} · ${st.fase === 'fin' ? `Final ${r.total.L.gana}-${r.total.V.gana}` : st.fase === 'preparacion' ? 'Sin empezar' : `En juego · sets ${st.ganados.L}-${st.ganados.V}`}</span></span>
        <span class="row"><button data-abrir="${esc(a.id)}">Abrir</button><button class="ghost" data-borrar="${esc(a.id)}">Borrar</button></span></div>`; }).join('')}</section>` : ''}`;
  $('nueva').onclick = () => crear({});
  $('importar').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const a = JSON.parse(await f.text());
      if (!a || !Array.isArray(a.ev) || typeof a.datos !== 'object') throw new Error('no es un acta');
      M.reproducir(a.cfg, a.datos, reparar({ ...a, id: a.id || 'imp' }).ev);   // que se pueda abrir
      const id = localStorage.getItem(clave(a.id)) ? Date.now().toString(36) + Math.random().toString(36).slice(2, 6) : (a.id || Date.now().toString(36));
      localStorage.setItem(clave(id), JSON.stringify({ ...a, id, actualizada: new Date().toISOString() }));
      toast('Acta importada.', true); abrir(id);
    } catch (x) { toast('Ese archivo no es un acta válida: ' + x.message); }
  };
  $('app').querySelectorAll('[data-desde]').forEach((b) => (b.onclick = () => {
    const m = MIOS.find((x) => x.id === b.dataset.desde), [l, v] = (m.teams || '').split(' vs ');
    const crew = (f) => titulo((m.crew || []).find((c) => c.f === f)?.n || '');
    A_ORIGEN = { local: l, visitante: v, fecha: m.date, cat: m.comp };   // la categoría decide el equipo (los clubes repiten nombres)
    crear({ competicion: titulo(m.comp), partido: m.id, fecha: m.date, hora: m.time, pabellon: titulo(m.venue), ciudad: titulo((m.addr || '').match(/\d{5}\s+([^,]+)/)?.[1] || ''),
      local: titulo(l), visitante: titulo(v), r1: crew('r1'), r2: crew('r2'), an: crew('an') });
  }));
  $('app').querySelectorAll('[data-abrir]').forEach((b) => (b.onclick = () => abrir(b.dataset.abrir)));
  $('app').querySelectorAll('[data-borrar]').forEach((b) => (b.onclick = () => { if (confirmar('¿Borrar esta acta de este dispositivo?')) { localStorage.removeItem(clave(b.dataset.borrar)); pintar(); } }));
}
let A_ORIGEN = null;
// Infantil: sin líbero y con set obligatorio por jugador (se puede cambiar en Datos).
const esInfantil = (d) => /INFANTIL/i.test(`${d.competicion || ''} ${d.categoria || ''}`);
function crear(datos) {
  const inf = esInfantil(datos);
  A = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), cfg: { ...M.CONFIG, ...(inf ? { liberos: false, setObligatorio: true } : {}) }, datos, ev: [], paso: 'datos', creada: new Date().toISOString(),
    ...(A_ORIGEN ? { origen: A_ORIGEN } : {}) };
  A_ORIGEN = null; reiniciar();
  guardar(); history.replaceState(null, '', '?acta=' + A.id); pintar(); scrollTo(0, 0);
}
function reiniciar() { delete BORR.L; delete BORR.V; ISQ = { estado: null, msg: '' }; VER = false; }   // nada de un acta pasa a otra
function abrir(id) { reiniciar(); try { A = reparar(JSON.parse(localStorage.getItem(clave(id)))); } catch (e) { A = null; } if (!A) { toast('No se encuentra esa acta.'); return; } history.replaceState(null, '', '?acta=' + A.id); pintar(); scrollTo(0, 0); }
function salir() { A = null; ST = null; reiniciar(); history.replaceState(null, '', location.pathname); pintar(); }

/* ---------- 1. Datos del partido ---------- */
function campo(k, t, tipo = 'text', extra = '') { return `<label class="f"><span>${esc(t)}</span><input type="${tipo}" data-d="${k}" value="${esc(A.datos[k] || '')}" ${extra}></label>`; }
function pDatos() {
  const c = A.cfg;
  $('app').innerHTML = pasos('datos') + `<form class="card" id="f"><h2>Datos del partido</h2>
    <div class="grid2">${campo('competicion', 'Competición')}${campo('categoria', 'Categoría')}${campo('partido', 'Nº de partido')}${campo('fecha', 'Fecha', 'date')}${campo('hora', 'Hora', 'time')}${campo('pabellon', 'Pabellón')}${campo('ciudad', 'Población')}</div>
    <h3 style="font-size:16px;margin:8px 0">Equipos</h3><div class="grid2">${campo('local', 'Local')}${campo('visitante', 'Visitante')}</div>
    <h3 style="font-size:16px;margin:8px 0">Árbitros y mesa</h3><div class="grid2">${campo('r1', '1er árbitro')}${campo('r2', '2º árbitro')}${campo('an', 'Anotador')}${campo('aa', 'Anotador ayudante')}${campo('jl1', 'Juez de línea 1')}${campo('jl2', 'Juez de línea 2')}</div>
    <h3 style="font-size:16px;margin:8px 0">Formato</h3><div class="grid2">
      <label class="f"><span>Partido al mejor de</span><select id="mejorDe"><option value="5"${c.mejorDe === 5 ? ' selected' : ''}>5 sets (gana quien llega a 3)</option><option value="3"${c.mejorDe === 3 ? ' selected' : ''}>3 sets (gana quien llega a 2)</option></select></label>
      <label class="f"><span>Puntos por set</span><input type="number" id="puntosSet" min="5" max="50" value="${c.puntosSet}"></label>
      <label class="f"><span>Puntos del set decisivo</span><input type="number" id="puntosDecisivo" min="5" max="50" value="${c.puntosDecisivo}"></label>
      <label class="f"><span>Cambios por set</span><input type="number" id="sustituciones" min="1" max="20" value="${c.sustituciones}"></label>
      <label class="f"><span>Tiempos por set</span><input type="number" id="tiempos" min="0" max="5" value="${c.tiempos}"></label></div>
    <label class="chk opcion"><input type="checkbox" id="cfgLib"${c.liberos ? ' checked' : ''}> <span><b>Hay líbero</b><br><span class="small muted">Desactívalo en las categorías que juegan sin líbero.</span></span></label>
    <label class="chk opcion"><input type="checkbox" id="cfgSet"${c.setObligatorio ? ' checked' : ''}> <span><b>Set obligatorio por jugador</b><br><span class="small muted">Infantil (FCVB, Circular 011): cada jugador del acta tiene que jugar al menos un set completo. Al final se revisa y se puede corregir a mano.</span></span></label>
    <div class="row"><button type="button" class="ghost" id="volver">Mis actas</button><button class="primary">Siguiente: equipos</button></div></form>`;
  $('volver').onclick = salir;
  $('f').onsubmit = (e) => {
    e.preventDefault();
    $('f').querySelectorAll('[data-d]').forEach((i) => (A.datos[i.dataset.d] = i.value.trim()));
    if (!A.datos.local || !A.datos.visitante) { toast('Escribe el nombre de los 2 equipos.'); return; }
    A.cfg = { ...A.cfg, mejorDe: +$('mejorDe').value, puntosSet: +$('puntosSet').value || 25, puntosDecisivo: +$('puntosDecisivo').value || 15, sustituciones: Math.min(20, Math.max(1, +$('sustituciones').value || 6)), tiempos: Math.min(5, Math.max(0, +$('tiempos').value || 0)), liberos: $('cfgLib').checked, setObligatorio: $('cfgSet').checked };
    // Sin líbero: se quita la marca de líbero de las plantillas ya guardadas y de las que se están escribiendo.
    if (!A.cfg.liberos) {
      A.ev = A.ev.map((e) => (e.t === 'equipo' ? { ...e, jugadores: e.jugadores.map(({ lib, ...j }) => j) } : e));
      for (const eq of ['L', 'V']) BORR[eq]?.jugadores.forEach((j) => delete j.lib);
    }
    A.paso = 'equipos'; guardar(); pintar(); scrollTo(0, 0);
  };
}

/* ---------- 2. Equipos ---------- */
const BORR = {};   // plantillas en edición (sin guardar todavía en el acta)
const clavePlantilla = (nombre) => 'acta-plantilla:' + nombre;
const nombreKey = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().split(/[^A-Z]+/).filter(Boolean).sort().join(' ');
// Plantillas de iSquad del partido (función equipos, acción plantillas): jugadores sin dorsal (la web no los da), entrenador y
// segundo; los dorsales, capitán y líberos se recuperan de la última acta de ese equipo en este dispositivo, por nombre.
let ISQ = { estado: null, msg: '' };
async function cargarIsquad(forzar) {
  if (!A.origen || (!forzar && A.isqCargada) || ISQ.estado === 'cargando') return;
  ISQ = { estado: 'cargando', msg: '' }; pEquipos();
  window.pepperLoader?.show('Leyendo las plantillas de iSquad…');
  let r = {};
  const corte = new AbortController(), tope = setTimeout(() => corte.abort(), 60000);   // iSquad a veces tarda: como mucho 1 minuto
  try {
    const { data: { session } } = await sbc().auth.getSession();
    const res = await fetch(window.APP_CONFIG.SUPABASE_URL + '/functions/v1/equipos', { method: 'POST', signal: corte.signal, headers: { 'Content-Type': 'application/json', apikey: window.APP_CONFIG.SUPABASE_ANON_KEY, ...(session ? { Authorization: 'Bearer ' + session.access_token } : {}) }, body: JSON.stringify({ action: 'plantillas', ...A.origen }) });
    r = await res.json().catch(() => ({})); if (!res.ok) r = { error: r.error || 'No se ha podido leer iSquad.' };
  } catch (e) { r = { error: e.name === 'AbortError' ? 'iSquad no ha respondido a tiempo: escribe las plantillas a mano o vuelve a cargarlas.' : 'Sin conexión: escribe las plantillas a mano.' }; }
  finally { clearTimeout(tope); window.pepperLoader?.done(); }
  if (r.error) { ISQ = { estado: 'error', msg: r.error }; if (A && vista() === 'equipos') pEquipos(); return; }
  for (const eq of ['L', 'V']) {
    const t = r[eq]; if (!t) continue;
    const nombre = eqNombre(eq); let prev = null;
    try { prev = JSON.parse(localStorage.getItem(clavePlantilla(nombre)) || 'null'); } catch (x) {}
    const mem = new Map((prev?.jugadores || []).filter((j) => j.nombre).map((j) => [nombreKey(j.nombre), j]));
    const jug = t.personas.filter((x) => x.perfil === 'jugador').map((x) => { const m = mem.get(nombreKey(x.nombre)) || {}; return { num: m.num || '', nombre: titulo(x.nombre), cap: !!m.cap, lib: A.cfg.liberos && !!m.lib, isq: true }; })
      .sort((a, b) => (a.num === '' ? 999 : a.num === '00' ? 0.5 : +a.num) - (b.num === '' ? 999 : b.num === '00' ? 0.5 : +b.num) || a.nombre.localeCompare(b.nombre));
    const ent = t.personas.filter((x) => x.perfil === 'entrenador');
    const segundo = (x) => /2|SEGON|SEGUN|AYUD|AJUD|AUX/i.test(x.cargo);
    const E = ent.find((x) => !segundo(x)), E2 = ent.find((x) => segundo(x)) || ent.filter((x) => x !== E)[0];
    BORR[eq] = { jugadores: jug.length ? jug : [{ num: '', nombre: '' }], isq: jug.length,
      oficiales: ['E', 'E2', 'F', 'M'].map((rol) => ({ rol, nombre: rol === 'E' && E ? titulo(E.nombre) : rol === 'E2' && E2 ? titulo(E2.nombre) : (prev?.oficiales || []).find((o) => o.rol === rol)?.nombre || '' })) };
  }
  ISQ = { estado: 'ok', msg: [r.L ? '' : eqNombre('L'), r.V ? '' : eqNombre('V')].filter(Boolean).join(' y ') };
  A.isqCargada = true; guardar();
  if (A && vista() === 'equipos') pEquipos();
}
function borrador(eq) {
  if (!BORR[eq] && A.quitados?.[eq]?.length) {
    const e = ST.equipos[eq];
    BORR[eq] = { jugadores: [...e.jugadores.map((j) => ({ ...j })), ...A.quitados[eq].map((j) => ({ ...j }))],
      oficiales: ['E', 'E2', 'F', 'M'].map((rol) => ({ rol, nombre: e.oficiales.find((o) => o.rol === rol)?.nombre || '' })) };
  }
  if (!BORR[eq]) {
    const e = ST.equipos[eq];
    BORR[eq] = { jugadores: e.jugadores.length ? e.jugadores.map((j) => ({ ...j })) : Array.from({ length: 12 }, () => ({ num: '', nombre: '' })),
      oficiales: ['E', 'E2', 'F', 'M'].map((rol) => ({ rol, nombre: e.oficiales.find((o) => o.rol === rol)?.nombre || '' })) };
    try { const prev = JSON.parse(localStorage.getItem(clavePlantilla(eq === 'L' ? A.datos.local : A.datos.visitante)) || 'null'); if (prev && !e.jugadores.length) Object.assign(BORR[eq], { ...prev, jugadores: prev.jugadores.filter((j) => j.nombre || j.num) }); } catch (x) {}
  }
  return BORR[eq];
}
function tablaEquipo(eq) {
  const b = borrador(eq), nombre = eq === 'L' ? A.datos.local : A.datos.visitante;
  const q = A.quitados?.[eq] || [];
  const deQuitados = q.length ? `<p class="msg err small">Dorsal no válido de una versión anterior: ${q.map((j) => `${esc(j.nombre || 'sin nombre')} (${esc(j.num || 'vacío')})`).join(', ')}. Pon un dorsal de 0 a 99, o 00 (o quítalo con ✕).</p>` : '';
  const deIsq = b.isq ? `<p class="small muted">Plantilla de iSquad: ${b.isq} jugadores (sin las bajas). La web no da los dorsales: ponlos y quita con ✕ a quien no esté convocado.</p>` : '';
  return `<section class="card" data-eq="${eq}"><h2>${esc(nombre)} <span class="small muted">(${eq === 'L' ? 'local' : 'visitante'})</span></h2>${deQuitados}${deIsq}
    <table class="lista"><thead><tr><th>Dorsal</th><th>Nombre y apellidos</th><th>Cap.</th>${A.cfg.liberos ? '<th>Líbero</th>' : ''}<th></th></tr></thead><tbody>
    ${b.jugadores.map((j, i) => `<tr><td><input class="num" type="text" inputmode="numeric" maxlength="2" autocomplete="off" data-i="${i}" data-k="num" value="${esc(j.num)}" aria-label="Dorsal (0 a 99, o 00)"${j.num !== '' && j.num != null && !M.dorsalValido(j.num) ? ' aria-invalid="true"' : ''}></td>
      <td><input type="text" data-i="${i}" data-k="nombre" value="${esc(j.nombre || '')}" aria-label="Nombre"></td>
      <td><label class="chk"><input type="radio" name="cap${eq}" data-i="${i}" data-k="cap"${j.cap ? ' checked' : ''} aria-label="Capitán"></label></td>
      ${A.cfg.liberos ? `<td><label class="chk"><input type="checkbox" data-i="${i}" data-k="lib"${j.lib ? ' checked' : ''} aria-label="Líbero"></label></td>` : ''}
      <td><button type="button" class="x ghost" data-quitar="${i}" aria-label="Quitar">✕</button></td></tr>`).join('')}
    </tbody></table><div class="row" style="margin:8px 0 12px"><button type="button" data-mas>+ Jugador</button></div>
    <div class="grid2">${b.oficiales.map((o, i) => `<label class="f"><span>${esc(M.ROLES_OFICIALES[o.rol])}</span><input type="text" data-o="${i}" value="${esc(o.nombre)}"></label>`).join('')}</div></section>`;
}
function leerEquipo(eq) {
  const sec = $('app').querySelector(`[data-eq="${eq}"]`), b = borrador(eq);
  sec.querySelectorAll('[data-k]').forEach((i) => { const j = b.jugadores[+i.dataset.i]; if (i.dataset.k === 'num') j.num = i.value; else if (i.dataset.k === 'nombre') j.nombre = i.value; else j[i.dataset.k] = i.checked; });
  sec.querySelectorAll('[data-o]').forEach((i) => (b.oficiales[+i.dataset.o].nombre = i.value.trim()));
}
function pEquipos() {
  if (A.origen && !A.isqCargada && !ST.equipos.L.jugadores.length && ISQ.estado === null) { cargarIsquad(); return; }
  const aviso = ISQ.estado === 'cargando' ? ''
    : ISQ.estado === 'error' ? `<p class="msg err">${esc(ISQ.msg)}</p>`
    : ISQ.estado === 'ok' && ISQ.msg ? `<p class="msg err">No he encontrado en iSquad la plantilla de ${esc(ISQ.msg)}: escríbela a mano.</p>` : '';
  $('app').innerHTML = pasos('equipos') + aviso + `<p class="small muted">Dorsales y nombres tal como en la licencia. Marca el capitán${A.cfg.liberos ? ' y los líberos (como mucho 2)' : ' (en este partido no hay líbero)'}.${A.origen ? ' <button type="button" class="ghost" id="recargar">Volver a cargar de iSquad</button>' : ''}</p>
    <div class="dos">${tablaEquipo('L')}${tablaEquipo('V')}</div>
    <section class="card"><h2>Firmas antes del partido</h2><p class="small muted">Capitanes y entrenadores firman la plantilla.</p>${firmasHtml(FIRMAS_PRE)}</section>
    <div class="row"><button type="button" class="ghost" id="atras">Atrás</button><button class="primary" id="sig">Siguiente: sorteo y alineación</button></div>`;
  for (const eq of ['L', 'V']) {
    const sec = $('app').querySelector(`[data-eq="${eq}"]`);
    sec.querySelector('[data-mas]').onclick = () => { leerEquipo('L'); leerEquipo('V'); borrador(eq).jugadores.push({ num: '', nombre: '' }); pEquipos(); };
    sec.querySelectorAll('[data-quitar]').forEach((b) => (b.onclick = () => { leerEquipo('L'); leerEquipo('V'); borrador(eq).jugadores.splice(+b.dataset.quitar, 1); pEquipos(); }));
  }
  // Dorsal no válido: en rojo al escribirlo (y no deja seguir al guardar).
  $('app').querySelectorAll('[data-k=num]').forEach((i) => i.addEventListener('input', () => { const v = i.value.trim(); if (v && !M.dorsalValido(v)) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid'); }));
  enlazarFirmas(() => { leerEquipo('L'); leerEquipo('V'); });   // que firmar no borre lo escrito sin guardar
  $('recargar')?.addEventListener('click', () => { if (confirmar('¿Volver a cargar las plantillas de iSquad? Se pierden los cambios de esta pantalla.')) { delete BORR.L; delete BORR.V; cargarIsquad(true); } });
  $('atras').onclick = () => { leerEquipo('L'); leerEquipo('V'); A.paso = 'datos'; guardar(); pintar(); };
  $('sig').onclick = () => {
    leerEquipo('L'); leerEquipo('V');
    for (const eq of ['L', 'V']) {
      const b = borrador(eq), nombre = eq === 'L' ? A.datos.local : A.datos.visitante;
      const sinDorsal = b.jugadores.filter((j) => String(j.num).trim() === '' && String(j.nombre || '').trim());
      if (sinDorsal.length) { toast(`${nombre}: falta el dorsal de ${sinDorsal.slice(0, 3).map((j) => j.nombre).join(', ')}${sinDorsal.length > 3 ? '…' : ''} (o quítalo con ✕).`); return; }
      const malos = b.jugadores.filter((j) => String(j.num ?? '').trim() !== '' && !M.dorsalValido(j.num));
      if (malos.length) { toast(`${nombre}: dorsal no válido ${malos.map((j) => '"' + String(j.num).trim() + '"').join(', ')}. Tiene que ser de 0 a 99, o 00.`); $('app').querySelector(`[data-eq="${eq}"] [data-k=num][aria-invalid="true"]`)?.focus(); return; }
      const jugadores = b.jugadores.filter((j) => String(j.num).trim() !== '').map((j) => ({ num: M.D(j.num), nombre: titulo(String(j.nombre || '').trim()), ...(j.cap ? { cap: true } : {}), ...(j.lib ? { lib: true } : {}) }));
      const ev = { t: 'equipo', eq, nombre, jugadores, oficiales: b.oficiales.filter((o) => o.nombre) };
      if (jugadores.filter((j) => !j.lib).length < 6) { toast(`${nombre}: hacen falta al menos 6 jugadores que no sean líberos.`); return; }
      if (!jugadores.some((j) => j.cap)) { toast(`${nombre}: marca quién es el capitán.`); return; }
      const m = M.validar(A.cfg, A.datos, A.ev, ev); if (m) { toast(`${nombre}: ${m}`); return; }
      A.ev = A.ev.filter((e) => !(e.t === 'equipo' && e.eq === eq)); A.ev.push({ ...ev, h: new Date().toISOString() });
      try { localStorage.setItem(clavePlantilla(nombre), JSON.stringify({ jugadores: b.jugadores.filter((j) => j.num || j.nombre), oficiales: b.oficiales })); } catch (x) {}
    }
    delete A.quitados; A.paso = 'sorteo'; guardar(); pintar(); scrollTo(0, 0);
  };
}

/* ---------- Firmas (en pantalla, con el dedo o el ratón) ---------- */
function firmasHtml(lista) {
  return `<div class="firmas">${lista.map(([rol, t]) => { const f = ST.firmas[rol]; return `<div class="f"><b class="small">${esc(t)}</b>${f ? `<img src="${f.img}" alt="Firma de ${esc(t)}"><div class="small muted">${esc(f.nombre)} · ${hora(f.h)}</div>` : '<div class="small muted" style="margin:6px 0">Sin firmar</div>'}<button type="button" data-firmar="${rol}" data-t="${esc(t)}">${f ? 'Volver a firmar' : 'Firmar'}</button></div>`; }).join('')}</div>`;
}
function nombreFirma(rol) {
  const cap = (eq) => { const j = ST.equipos[eq].jugadores.find((x) => x.cap); return j ? `${j.nombre} (${j.num})` : ''; };
  const ent = (eq) => ST.equipos[eq].oficiales.find((o) => o.rol === 'E')?.nombre || '';
  return { capL: cap('L'), capV: cap('V'), preCapL: cap('L'), preCapV: cap('V'), preEL: ent('L'), preEV: ent('V'), aa: A.datos.aa, an: A.datos.an, r1: A.datos.r1, r2: A.datos.r2 }[rol] || '';
}
function enlazarFirmas(antes) {
  $('app').querySelectorAll('[data-firmar]').forEach((b) => (b.onclick = () => { antes?.(); firmar(b.dataset.firmar, b.dataset.t); }));
}
function firmar(rol, t) {
  hoja(`<h2 id="hojaT">Firma: ${esc(t)}</h2><label class="f"><span>Nombre</span><input type="text" id="fNom" value="${esc(nombreFirma(rol))}"></label>
    <div class="firma"><canvas id="lienzo" width="600" height="200" aria-label="Zona de firma"></canvas></div>
    <div class="row" style="margin-top:10px"><button class="primary" id="fOk">Guardar firma</button><button id="fBorrar">Borrar</button><button class="ghost" data-cerrar>Cancelar</button></div>`);
  const c = $('lienzo'), x = c.getContext('2d'); let pinta = false, algo = false;
  x.lineWidth = 2.5; x.lineCap = 'round'; x.strokeStyle = '#000';
  const p = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.onpointerdown = (e) => { pinta = true; c.setPointerCapture(e.pointerId); x.beginPath(); x.moveTo(...p(e)); };
  c.onpointermove = (e) => { if (!pinta) return; x.lineTo(...p(e)); x.stroke(); algo = true; };
  c.onpointerup = c.onpointercancel = () => (pinta = false);
  $('fBorrar').onclick = () => { x.clearRect(0, 0, c.width, c.height); algo = false; };
  $('fOk').onclick = () => {
    if (!$('fNom')) return;   // ya guardada (doble pulsación)
    if (!algo) { toast('Firma en el recuadro.'); return; }
    if (!$('fNom').value.trim()) { toast('Escribe el nombre.'); return; }
    const ev = { t: 'firma', rol, nombre: $('fNom').value.trim(), img: c.toDataURL('image/png') };   // leer antes de cerrar la hoja
    cerrarHoja(); hacer(ev);
  };
}

/* ---------- 3. Sorteo y alineaciones ---------- */
const alineables = (eq) => ST.equipos[eq].jugadores.filter((j) => !j.lib && !ST.descalificados[eq].has(j.num) && !ST.fueraPartido[eq].has(j.num));
const opcionJugador = (j, sel) => `<option value="${esc(j.num)}"${sel ? ' selected' : ''}>${esc(j.num)}${j.cap ? ' (C)' : ''} ${esc(j.nombre.split(' ')[0] || '')}</option>`;
function selectorAlineacion(eq, previa) {
  const orden = [3, 2, 1, 4, 5, 0];   // como en la pista: delanteros IV III II, zagueros V VI I
  // Las opciones las pone enlazarAlineacion(): cada jugador solo sale en el desplegable donde está elegido o en los libres.
  return `<div class="alinea" data-al="${eq}">${orden.map((i) => `<label>${POS[i]}<select data-pos="${i}" data-previa="${esc(previa?.[i] || '')}"></select></label>`).join('')}</div>
    <p class="small muted" style="margin:4px 0 0">Red arriba. I = zaguero derecho, el que saca.</p>`;
}
// Un jugador elegido en una posición desaparece de los desplegables de las otras (y vuelve si se cambia). Se rehace la
// lista entera: las opciones escondidas siguen saliendo en el desplegable del iPhone.
function enlazarAlineacion() {
  $('app').querySelectorAll('[data-al]').forEach((box) => {
    const js = alineables(box.dataset.al), sels = [...box.querySelectorAll('select')];
    const pintar = () => {
      const usados = sels.map((x) => x.value || x.dataset.previa).filter(Boolean);
      for (const x of sels) {
        const v = x.value || x.dataset.previa; x.dataset.previa = '';
        x.innerHTML = '<option value=""></option>' + js.filter((j) => j.num === v || !usados.includes(j.num)).map((j) => opcionJugador(j, j.num === v)).join('');
      }
    };
    box.addEventListener('change', pintar);
    pintar();
  });
}
function leerAlineacion(eq) { const a = []; $('app').querySelectorAll(`[data-al="${eq}"] select`).forEach((s) => (a[+s.dataset.pos] = s.value || null)); return a; }
function eqNombre(eq) { return eq === 'L' ? A.datos.local : A.datos.visitante; }
function opcionesEq(name, sel) { return `<div class="opts" role="radiogroup">${['L', 'V'].map((eq) => `<label><input type="radio" name="${name}" value="${eq}"${sel === eq ? ' checked' : ''}><span>${esc(eqNombre(eq))}</span></label>`).join('')}</div>`; }
function pSorteo() {
  const s = M.setActual(ST);
  $('app').innerHTML = pasos('sorteo') + `<section class="card"><h2>Sorteo</h2>
      <fieldset><legend>Saca primero</legend>${opcionesEq('saca', s.saqueInicial)}</fieldset>
      <fieldset><legend>A la izquierda del anotador (equipo A)</legend>${opcionesEq('izq', s.izq)}</fieldset></section>
    <div class="grid2"><section class="card"><h2>${esc(A.datos.local)}</h2>${selectorAlineacion('L', s.alineacion.L)}</section><section class="card"><h2>${esc(A.datos.visitante)}</h2>${selectorAlineacion('V', s.alineacion.V)}</section></div>
    <div class="row"><button class="ghost" id="atras">Atrás</button><button class="primary" id="empezar">Empezar el set 1</button><button class="ghost" id="noPresentado">Incomparecencia…</button></div>`;
  enlazarAlineacion();
  $('atras').onclick = () => { A.paso = 'equipos'; guardar(); pintar(); };
  $('empezar').onclick = () => empezarSet(true);
  $('noPresentado').onclick = () => hoja(`<h2 id="hojaT">Incomparecencia</h2><p class="small">El equipo que no se presenta pierde 0-3 (25-0 en cada set) y queda anotado en el acta.</p>
    <div class="row">${['L', 'V'].map((eq) => `<button data-np="${eq}">No se presenta ${esc(eqNombre(eq))}</button>`).join('')}<button class="ghost" data-cerrar>Cancelar</button></div>`, () => {
    $('hojaC').querySelectorAll('[data-np]').forEach((b) => (b.onclick = () => { if (!hacer({ t: 'incompleto', eq: b.dataset.np, motivo: 'incomparecencia' })) cerrarHoja(); }));
  });
}
function empezarSet(conSorteo) {
  const q = (n) => $('app').querySelector(`input[name="${n}"]:checked`)?.value;
  const evs = [];
  if (conSorteo) { if (!q('saca') || !q('izq')) { toast('Indica quién saca y quién está a la izquierda.'); return; } evs.push({ t: 'sorteo', saca: q('saca'), izq: q('izq') }); }
  for (const eq of ['L', 'V']) { const a = leerAlineacion(eq); if (a.some((n) => !n)) { toast(`Falta completar la alineación de ${eqNombre(eq)}.`); return; } evs.push({ t: 'alineacion', eq, jugadores: a }); }
  evs.push({ t: 'inicioSet' });
  // Todo o nada: se valida la secuencia entera antes de guardarla.
  const prueba = [...A.ev], h = new Date().toISOString();
  for (const e of evs) { const m = M.validar(A.cfg, A.datos, prueba, { ...e, h }); if (m) { toast(m); return; } prueba.push({ ...e, h }); }
  A.ev = prueba; guardar(); pintar(); publicarDirecto(); scrollTo(0, 0);
}

/* ---------- 4. Partido ---------- */
function pista(s, eq) {
  const r = M.enPista(s, eq), l = s.libero[eq], saca = s.saque === eq;
  const celda = (i) => { const n = r[i], j = ST.equipos[eq].jugadores.find((x) => x.num === n); return `<button type="button" class="p${l && l.pos === i ? ' lib' : ''}${saca && i === 0 ? ' saca' : ''}" data-tocar="${eq}" data-num="${esc(n)}" title="Posición ${POS[i]} · tocar para cambiarlo" aria-label="${esc(n)}, posición ${POS[i]}: cambiarlo">${esc(n)}${j?.cap ? '<small>C</small>' : `<small>${POS[i]}</small>`}</button>`; };
  return `<div class="pista" aria-label="Posiciones de ${esc(eqNombre(eq))}"><div class="red" aria-hidden="true"></div>${[3, 2, 1, 4, 5, 0].map(celda).join('')}</div>`;
}
// Puntos que se van gastando (tiempos y cambios).
const gastados = (n, max, t) => `<span class="dots" role="img" aria-label="${esc(t)}: ${n} de ${max}">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
function mitad(s, eq) {
  const pend = s.pendienteSust[eq], e = ST.equipos[eq], l = s.libero[eq];
  const enP = new Set(M.enPista(s, eq));
  const banco = e.jugadores.filter((j) => !enP.has(j.num));
  const fuera = (j) => ST.descalificados[eq].has(j.num) || ST.fueraPartido[eq].has(j.num) || s.expulsados[eq].has(j.num);
  const sanc = ST.sanciones.filter((x) => x.eq === eq);
  const quien = (q) => (M.esDorsal(q) ? q : q === 'equipo' ? 'Equipo' : q);
  return `<div class="mitad" data-mitad="${eq}">
    <div class="m-cab solo-pc"><div class="m-nom">${s.saque === eq ? '<span class="balon" role="img" aria-label="Saca"></span>' : ''}${esc(eqNombre(eq))}</div><div class="m-sets" title="Sets ganados">${ST.ganados[eq]}</div></div>
    ${pend.length ? `<p class="msg err small" style="margin:0 0 8px">Hay que sustituir al ${pend.join(', ')}</p>` : ''}
    <div class="solo-movil">${pista(s, eq)}</div>
    <button class="btnPunto solo-movil" data-punto="${eq}">Punto <span class="solo-movil-i">${esc(eqNombre(eq).split(' ').slice(0, 2).join(' '))}</span></button>
    <div class="acts">
      <button data-acc="tiempo" data-eq="${eq}">Tiempo<b>${s.tiempos[eq].length}/${ST.cfg.tiempos}</b></button>
      <button data-acc="sust" data-eq="${eq}">Cambio<b>${s.nSust[eq]}/${ST.cfg.sustituciones}</b></button>
      ${ST.cfg.liberos ? `<button data-acc="libero" data-eq="${eq}">Líbero${l ? '<b>en pista</b>' : ''}</button>` : ''}
      <button data-acc="sancion" data-eq="${eq}">Sanción</button>
    </div>
    <div class="m-info solo-pc">
      <div class="m-fila"><span>Tiempos</span>${gastados(s.tiempos[eq].length, ST.cfg.tiempos, 'Tiempos')}</div>
      <div class="m-fila"><span>Cambios</span>${gastados(s.nSust[eq], ST.cfg.sustituciones, 'Cambios')}</div>
      <h4>En pista</h4>${listaJugadores(s, eq, [...enP], true)}
      <h4>Banquillo</h4>${listaJugadores(s, eq, banco.map((j) => j.num), false)}
      ${ST.cfg.setObligatorio ? (() => { const sc = Object.values(M.setsCompletos(ST)[eq]).filter((x) => !x.cumple); return `<h4>Les falta un set completo</h4><div class="chips">${sc.map((x) => `<span class="chip falta" title="${esc(x.nombre)}">${esc(x.num)}</span>`).join('') || '<span class="small muted">A nadie ✓</span>'}</div>`; })() : ''}
      ${sanc.length ? `<h4>Sanciones</h4><ul class="sancs">${sanc.map((x) => `<li><span class="tarjeta t-${x.tipo}" aria-hidden="true"></span>${esc(SANC[x.tipo])} · ${esc(quien(x.quien))} <span class="muted">set ${x.set}, ${x.a}:${x.b}</span></li>`).join('')}</ul>` : ''}
    </div></div>`;
}
// Listas de jugadores del panel (PC), como el e-Scoresheet: capitán, dorsal y nombre; quién ha entrado por quién; sanciones
// del jugador; líberos en amarillo; los que ya no pueden jugar, tachados.
const MARCA = { amonestacion: 'A', castigo: 'C', expulsion: 'E', descalificacion: 'D' };
function listaJugadores(s, eq, nums, enPista) {
  const e = ST.equipos[eq], l = s.libero[eq], parejas = s.parejas[eq];
  const porQuien = (n) => Object.keys(parejas).find((t) => parejas[t] === n);
  const filas = nums.map((n) => e.jugadores.find((j) => j.num === n)).filter(Boolean).map((j) => {
    const sanc = ST.sanciones.filter((x) => x.eq === eq && x.quien === j.num && MARCA[x.tipo]);
    const fuera = ST.descalificados[eq].has(j.num) || ST.fueraPartido[eq].has(j.num) || s.expulsados[eq].has(j.num);
    let nota = '';
    if (enPista && l && l.num === j.num) nota = `por ${l.por}`;
    else if (enPista && porQuien(j.num)) nota = `(${porQuien(j.num)})`;
    else if (!enPista && parejas[j.num] != null) { const c = s.sust[eq].find((x) => x.sale === j.num); nota = c ? `salió ${c.a}-${c.b}` : ''; }
    else if (!enPista && s.jugados[eq].has(j.num)) nota = 'ya jugó';
    if (!enPista && l && l.por === j.num) nota = `por el líbero ${l.num}`;
    return `<li class="${j.lib ? 'lib' : ''}${fuera ? ' fuera' : ''}"><span class="cap">${j.cap ? 'C' : j.lib ? 'L' : ''}</span><b>${esc(j.num)}</b><span class="nm">${esc(j.nombre || '')}</span><span class="nota">${esc(nota)}</span>${sanc.map((x) => `<span class="tarjeta t-${x.tipo}" title="${esc(SANC[x.tipo])}"></span>`).join('')}</li>`;
  });
  return filas.length ? `<ul class="lj">${filas.join('')}</ul>` : '<p class="small muted">—</p>';
}
const corto2 = (nombre) => { const w = String(nombre || '').split(' ').filter(Boolean); return (w[0] || '').slice(0, 11); };
// Pista vista desde la mesa del anotador (PC): la red en medio; cada equipo mira hacia la red, así que el de la izquierda
// tiene la I abajo a la izquierda y el de la derecha, arriba a la derecha.
function pistaGrande(s) {
  const izq = s.izq, der = OTRO(izq), ultimo = [...A.ev].reverse().find((e) => !['equipo', 'firma'].includes(e.t));
  const campo = (eq, orden) => {
    const r = M.enPista(s, eq), l = s.libero[eq];
    return `<div class="campo" aria-label="${esc(eqNombre(eq))}">${orden.map((i) => {
      const n = r[i], j = ST.equipos[eq].jugadores.find((x) => x.num === n), saca = s.saque === eq && i === 0;
      return `<button type="button" class="jug${l && l.pos === i ? ' lib' : ''}${saca ? ' saca' : ''}" data-tocar="${eq}" data-num="${esc(n)}" title="Posición ${POS[i]}${j ? ' · ' + esc(j.nombre) : ''} · tocar para cambiarlo" aria-label="${esc(n)}${j ? ' ' + esc(j.nombre) : ''}, posición ${POS[i]}: cambiarlo"><span class="n">${esc(n)}</span>${j?.cap ? '<span class="cap">C</span>' : ''}${saca ? '<span class="pelota" aria-hidden="true"></span>' : ''}<span class="nmb">${esc(corto2(j?.nombre))}</span><span class="pos">${POS[i]}</span></button>`;
    }).join('')}</div>`;
  };
  return `<div class="cancha"><div class="c-nom"><span>${esc(eqNombre(izq))}</span><span>${esc(eqNombre(der))}</span></div>
    <div class="c-pista">${campo(izq, [4, 3, 5, 2, 0, 1])}<div class="red" aria-hidden="true"></div>${campo(der, [1, 0, 2, 5, 3, 4])}</div>
    <div class="c-mesa">Mesa del anotador</div></div>
    <div class="c-ultimo"><span>${ultimo ? `<span class="muted">Último:</span> ${esc(describir(ultimo, ST))}` : '<span class="muted">Todavía no hay nada que deshacer.</span>'}</span><button id="deshacer2" class="deshacer"${ultimo ? '' : ' disabled'}>Deshacer</button></div>
    <div class="c-puntos">${[izq, der].map((eq, k) => `<button class="btnPunto" data-punto="${eq}"><span>Punto</span><small>${esc(eqNombre(eq))} <kbd>${k ? '→' : '←'}</kbd></small></button>`).join('')}</div>
    <table class="c-resumen"><thead><tr><th>C</th><th>T</th><th>Pt</th><th>Set</th><th>Min</th><th>Pt</th><th>T</th><th>C</th></tr></thead><tbody>
      ${M.resultados(ST).filas.map((f) => `<tr${f.set === s.n && !s.fin ? ' class="actual"' : ''}><td>${f[izq].sust}</td><td>${f[izq].tiempos}</td><td><b>${f[izq].puntos}</b></td><td class="set">${f.set}</td><td>${f.duracion ?? (f.set === s.n ? '<span id="relojMin">…</span>' : '')}</td><td><b>${f[der].puntos}</b></td><td>${f[der].tiempos}</td><td>${f[der].sust}</td></tr>`).join('')}
    </tbody></table>`;
}
function describir(ev, st) {
  const n = (eq) => eqNombre(eq);
  switch (ev.t) {
    case 'punto': return `Punto ${n(ev.eq)}${ev.motivo && ev.motivo !== 'rally' ? ' (' + ev.motivo + ')' : ''}`;
    case 'tiempo': return `Tiempo ${n(ev.eq)}`;
    case 'sust': return `${ev.tipo === 'excepcional' ? 'Sustitución excepcional' : 'Cambio'} ${n(ev.eq)}: sale ${ev.sale}, entra ${ev.entra}`;
    case 'liberoEntra': return `Líbero ${n(ev.eq)}: entra ${ev.libero} por ${ev.sale}`;
    case 'liberoSale': return `Líbero ${n(ev.eq)}: sale`;
    case 'sancion': return `${SANC[ev.tipo]} ${M.esDorsal(ev.quien) ? 'al ' + ev.quien : ev.quien === 'equipo' ? 'al equipo' : 'al ' + M.ROLES_OFICIALES[ev.quien].toLowerCase()} (${n(ev.eq)})`;
    case 'impropia': return `Petición improcedente (${n(ev.eq)})`;
    case 'inicioSet': return 'Empieza el set';
    case 'sorteo': return 'Sorteo';
    case 'alineacion': return `Alineación ${n(ev.eq)}`;
    case 'obs': return 'Observación';
    case 'firma': return 'Firma';
    case 'repeticion': return 'Repetición de la jugada';
    case 'faltaRotacion': return `Falta de rotación de ${n(ev.eq)}: punto para ${n(M.OTRO(ev.eq))}`;
    case 'incompleto': return ev.motivo === 'incomparecencia' ? `Incomparecencia de ${n(ev.eq)}` : `${n(ev.eq)}: equipo incompleto`;
    case 'liberoNoPuede': return `Líbero ${ev.libero} de ${n(ev.eq)} no puede seguir${ev.nuevo ? ` · nuevo líbero: ${ev.nuevo}` : ''}`;
    case 'setCompleto': return `Set ${ev.set} del ${ev.num} (${n(ev.eq)}) ${ev.si ? 'marcado' : 'desmarcado'} como completo`;
    case 'equipo': return `Plantilla ${n(ev.eq)}`;
    default: return ev.t;
  }
}
// Pantalla siempre encendida durante el partido (si el navegador lo permite).
let BLOQUEO = null;
async function pantallaEncendida(si) {
  try {
    if (si && !BLOQUEO && 'wakeLock' in navigator && document.visibilityState === 'visible') { BLOQUEO = await navigator.wakeLock.request('screen'); BLOQUEO.addEventListener('release', () => { BLOQUEO = null; }); }
    else if (!si && BLOQUEO) { await BLOQUEO.release(); BLOQUEO = null; }
  } catch (e) { BLOQUEO = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ST?.fase === 'juego') pantallaEncendida(true); });
function pJuego() {
  pantallaEncendida(true);
  const s = M.setActual(ST), izq = s.izq, der = OTRO(izq);
  const ultimos = A.ev.slice(-10).reverse().filter((e) => !['equipo', 'firma'].includes(e.t));
  const jugados = ST.sets.filter((x) => x.ganador);
  $('app').innerHTML = pasos('juego') + `<div class="juego">
    <div class="j-marc"><div class="marcador" aria-live="polite">
      <div class="eq">${s.saque === izq ? '<span class="balon" role="img" aria-label="Saca"></span>' : ''}${esc(eqNombre(izq))}<div class="sets">${ST.ganados[izq]}</div></div>
      <div class="pts"><span class="p-i">${s.puntos[izq]}</span><span class="p-g">–</span><span class="p-d">${s.puntos[der]}</span><small>Set ${s.n}${s.decisivo ? ' · decisivo' : ''} · <span id="reloj" aria-label="Tiempo del set">0:00</span></small></div>
      <div class="eq d">${esc(eqNombre(der))}${s.saque === der ? '<span class="balon" role="img" aria-label="Saca"></span>' : ''}<div class="sets">${ST.ganados[der]}</div></div>
      ${jugados.length ? `<div class="historial">${jugados.map((x) => `<span class="${x.ganador === izq ? 'gi' : 'gd'}">Set ${x.n} · ${x.puntos[izq]}-${x.puntos[der]}</span>`).join('')}</div>` : ''}
    </div></div>
    <div class="j-izq">${mitad(s, izq)}</div>
    <div class="j-cancha">${pistaGrande(s)}</div>
    <div class="j-der">${mitad(s, der)}</div>
    <div class="j-barra"><div class="barra"><button id="deshacer" class="solo-movil">Deshacer</button><button id="repe">Repetición</button><button id="incid">Incidencias</button><button id="obs">Observación</button><button id="directo"${A.directo ? ' class="en-directo"' : ''}>${A.directo ? '● En directo' : 'Directo'}</button><button id="ver">Ver acta</button><button class="ghost" id="mis">Mis actas</button></div>
      <p class="small muted teclas">Teclado: <kbd>←</kbd> punto a ${esc(eqNombre(izq))} · <kbd>→</kbd> punto a ${esc(eqNombre(der))} · <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshacer</p></div>
    <div class="j-reg"><h3 class="solo-pc">Últimos sucesos</h3><div class="registro" aria-label="Últimos sucesos">${ultimos.map((e) => `<div><span class="h">${hora(e.h)}</span>${esc(describir(e, ST))}</div>`).join('')}</div></div>
  </div>`;
  $('app').querySelectorAll('[data-punto]').forEach((b) => (b.onclick = () => hacer({ t: 'punto', eq: b.dataset.punto })));
  $('app').querySelectorAll('[data-acc]').forEach((b) => (b.onclick = () => ({ tiempo: () => hacer({ t: 'tiempo', eq: b.dataset.eq }), sust: () => hojaSust(b.dataset.eq), libero: () => hojaLibero(b.dataset.eq), sancion: () => hojaSancion(b.dataset.eq) })[b.dataset.acc]()));
  // Tocar a un jugador de la pista abre el cambio con él ya elegido (Ferran, 4-nov); si es el líbero, la hoja del líbero.
  $('app').querySelectorAll('[data-tocar]').forEach((b) => (b.onclick = () => { const eq = b.dataset.tocar, l = M.setActual(ST).libero[eq]; if (l && l.num === b.dataset.num) hojaLibero(eq); else hojaSust(eq, b.dataset.num); }));
  $('deshacer2')?.addEventListener('click', deshacer);
  // Reloj del set (desde el silbato del primer saque).
  clearInterval(RELOJ);
  const tic = () => { const r = $('reloj'); if (!r) { clearInterval(RELOJ); return; } const seg = Math.max(0, Math.floor((Date.now() - Date.parse(s.inicio)) / 1000)); r.textContent = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`; const m = $('relojMin'); if (m) m.textContent = String(Math.floor(seg / 60)); };
  tic(); RELOJ = setInterval(tic, 1000);
  barraComun();
}
let RELOJ = null;
function barraComun() {
  $('deshacer')?.addEventListener('click', deshacer);
  $('repe')?.addEventListener('click', () => { if (!hacer({ t: 'repeticion' })) toast('Repetición anotada: sin punto para nadie.', true); });
  $('directo')?.addEventListener('click', hojaDirecto);
  $('incid')?.addEventListener('click', hojaIncidencias);
  $('obs')?.addEventListener('click', hojaObs);
  $('ver')?.addEventListener('click', () => { VER = true; pintar(); scrollTo(0, 0); });
  $('mis')?.addEventListener('click', salir);
}
function deshacer() {
  const ult = [...A.ev].reverse().find((e) => !['equipo', 'firma'].includes(e.t));
  if (!ult || ST.fase === 'preparacion') { toast('No hay nada que deshacer.'); return; }
  const i = A.ev.lastIndexOf(ult);
  // Empezar el set incluye sorteo y alineaciones: se deshace junto.
  let desde = i;
  if (ult.t === 'inicioSet') while (desde > 0 && ['alineacion', 'sorteo'].includes(A.ev[desde - 1].t)) desde--;
  if (!confirmar(`¿Deshacer "${describir(ult, ST)}"?`)) return;
  A.ev.splice(desde, i - desde + 1); guardar(); pintar(); publicarDirecto(); toast('Deshecho: ' + describir(ult, ST), true);
}

function hojaSust(eq, elegido) {
  const s = M.setActual(ST), pend = s.pendienteSust[eq];
  const enPista = s.rot[eq].filter((n) => !(s.libero[eq] && s.libero[eq].por === n));
  let sale = (elegido != null && enPista.includes(elegido) ? elegido : null) ?? pend[0] ?? null, entra = null, exc = false;
  const dibujar = () => {
    const banco = ST.equipos[eq].jugadores.filter((j) => !j.lib && !s.rot[eq].includes(j.num));
    const motivo = (n) => (exc ? null : sale == null ? 'Elige primero quién sale.' : M.motivoSust(ST, s, eq, sale, n));
    $('hojaC').innerHTML = `<h2 id="hojaT">Cambio · ${esc(eqNombre(eq))}</h2>
      <p class="small muted">Sustituciones en este set: ${s.nSust[eq]} de ${ST.cfg.sustituciones}.</p>
      <b>Sale</b><div class="botones">${enPista.map((n) => `<button data-sale="${n}" aria-pressed="${sale === n}">${n}</button>`).join('')}</div>
      <b>Entra</b><div class="botones">${banco.map((j) => { const m = motivo(j.num); return `<button data-entra="${j.num}" aria-pressed="${entra === j.num}"${m ? ` disabled title="${esc(m)}"` : ''}>${j.num}${j.nombre ? `<small>${esc(corto2(j.nombre))}</small>` : ''}</button>`; }).join('') || '<span class="small muted">No hay nadie en el banquillo.</span>'}</div>
      ${sale != null && !exc && banco.every((j) => motivo(j.num)) ? `<p class="motivo">Nadie puede entrar por el ${sale} con un cambio normal.</p>` : ''}
      <label class="chk" style="display:flex;gap:8px;align-items:center;margin:0 0 12px"><input type="checkbox" id="exc"${exc ? ' checked' : ''}> Sustitución excepcional (lesión, o expulsado sin cambio legal posible)</label>
      <div class="row"><button class="primary" id="ok"${sale == null || entra == null ? ' disabled' : ''}>Hacer el cambio</button><button class="ghost" data-cerrar>Cancelar</button></div>`;
    $('hojaC').querySelectorAll('[data-sale]').forEach((b) => (b.onclick = () => { sale = b.dataset.sale; entra = null; dibujar(); }));
    $('hojaC').querySelectorAll('[data-entra]').forEach((b) => (b.onclick = () => { entra = b.dataset.entra; dibujar(); }));
    $('exc').onchange = (e) => { exc = e.target.checked; entra = null; dibujar(); };
    $('ok').onclick = () => { if (!hacer({ t: 'sust', eq, sale, entra, ...(exc ? { tipo: 'excepcional' } : {}) })) cerrarHoja(); };
  };
  hoja('', () => { dibujar(); $('hojaC').querySelector('button')?.focus(); });
}
function hojaLibero(eq) {
  const s = M.setActual(ST), libs = ST.equipos[eq].jugadores.filter((j) => j.lib), l = s.libero[eq];
  if (!libs.filter((j) => !ST.fueraPartido[eq].has(j.num)).length) { toast(`${eqNombre(eq)} no tiene líbero que pueda jugar.`); return; }
  if (l) {
    const otro = libs.find((j) => j.num !== l.num);
    hoja(`<h2 id="hojaT">Líbero · ${esc(eqNombre(eq))}</h2><p>En pista: el ${l.num}, por el ${l.por}.</p>
      <div class="row"><button class="primary" id="sale">Sale el líbero (vuelve el ${l.por})</button>${otro ? `<button id="cambia">Cambiar por el ${otro.num}</button>` : ''}<button id="noPuede">No puede seguir…</button><button class="ghost" data-cerrar>Cancelar</button></div>`);
    $('noPuede').onclick = () => hojaLiberoNoPuede(eq);
    $('sale').onclick = () => { if (!hacer({ t: 'liberoSale', eq })) cerrarHoja(); };
    if (otro) $('cambia').onclick = () => { if (!hacer({ t: 'liberoEntra', eq, libero: otro.num, sale: l.num })) cerrarHoja(); };
    return;
  }
  let lib = libs[0].num;
  const dibujar = () => {
    const zagueros = [0, 4, 5].map((i) => ({ i, n: s.rot[eq][i] }));
    $('hojaC').innerHTML = `<h2 id="hojaT">Líbero · ${esc(eqNombre(eq))}</h2>
      ${libs.length > 1 ? `<b>Líbero</b><div class="botones">${libs.map((j) => `<button data-lib="${j.num}" aria-pressed="${lib === j.num}">${j.num}</button>`).join('')}</div>` : ''}
      <b>Entra por (solo zagueros)</b><div class="botones">${zagueros.map(({ i, n }) => { const m = M.validar(A.cfg, A.datos, A.ev, { t: 'liberoEntra', eq, libero: lib, sale: n, h: new Date().toISOString() }); return `<button data-por="${n}"${m ? ` disabled title="${esc(m)}"` : ''}>${n} <small>(${POS[i]})</small></button>`; }).join('')}</div>
      <div class="row"><button id="noPuede">Un líbero no puede seguir…</button><button class="ghost" data-cerrar>Cancelar</button></div>`;
    $('noPuede').onclick = () => hojaLiberoNoPuede(eq);
    $('hojaC').querySelectorAll('[data-lib]').forEach((b) => (b.onclick = () => { lib = b.dataset.lib; dibujar(); }));
    $('hojaC').querySelectorAll('[data-por]').forEach((b) => (b.onclick = () => { if (!hacer({ t: 'liberoEntra', eq, libero: lib, sale: b.dataset.por })) cerrarHoja(); }));
  };
  hoja('', () => { dibujar(); $('hojaC').querySelector('button')?.focus(); });
}
// FIVB 19.4: líbero lesionado, enfermo, expulsado o descalificado. Si queda otro líbero, juega ese; si no, el entrenador
// puede redesignar como líbero a un jugador que no esté en pista. El que no puede seguir ya no vuelve en el partido.
function hojaLiberoNoPuede(eq) {
  const s = M.setActual(ST), libs = ST.equipos[eq].jugadores.filter((j) => j.lib && !ST.fueraPartido[eq].has(j.num));
  let cual = s.libero[eq]?.num || libs[0]?.num, nuevo = null;
  const dibujar = () => {
    const quedan = libs.filter((j) => j.num !== cual);
    const candidatos = ST.equipos[eq].jugadores.filter((j) => !j.lib && !j.cap && !s.rot[eq].includes(j.num) && !ST.fueraPartido[eq].has(j.num) && !ST.descalificados[eq].has(j.num));
    $('hojaC').innerHTML = `<h2 id="hojaT">Líbero que no puede seguir · ${esc(eqNombre(eq))}</h2>
      <p class="small muted">Lesión, enfermedad, expulsión o descalificación. El líbero que no puede seguir ya no vuelve en el partido.</p>
      <b>Líbero</b><div class="botones">${libs.map((j) => `<button data-cual="${esc(j.num)}" aria-pressed="${cual === j.num}">${esc(j.num)}</button>`).join('')}</div>
      ${quedan.length ? `<p class="msg ok small">Sigue jugando el otro líbero, el ${esc(quedan[0].num)}.</p>` : `<b>Redesignar como líbero a</b> <span class="small muted">(un jugador que no esté en pista; o ninguno y se sigue sin líbero)</span>
        <div class="botones"><button data-nuevo="" aria-pressed="${nuevo === null}" style="font-size:15px">Ninguno</button>${candidatos.map((j) => `<button data-nuevo="${esc(j.num)}" aria-pressed="${nuevo === j.num}">${esc(j.num)}</button>`).join('')}</div>`}
      <div class="row"><button class="primary" id="ok">Confirmar</button><button class="ghost" data-cerrar>Cancelar</button></div>`;
    $('hojaC').querySelectorAll('[data-cual]').forEach((b) => (b.onclick = () => { cual = b.dataset.cual; nuevo = null; dibujar(); }));
    $('hojaC').querySelectorAll('[data-nuevo]').forEach((b) => (b.onclick = () => { nuevo = b.dataset.nuevo || null; dibujar(); }));
    $('ok').onclick = () => { if (!hacer({ t: 'liberoNoPuede', eq, libero: cual, ...(nuevo ? { nuevo } : {}) })) { cerrarHoja(); toast(nuevo ? `El ${nuevo} es ahora líbero.` : 'Anotado.', true); } };
  };
  hoja('', () => { dibujar(); $('hojaC').querySelector('button')?.focus(); });
}

// Incidencias del reglamento que no son un punto normal: falta de rotación (FIVB 7.7) y equipo incompleto (FIVB 6.4).
function hojaIncidencias() {
  hoja(`<h2 id="hojaT">Incidencias</h2>
    <h3 style="font-size:16px;margin:4px 0">Falta de rotación o sacador incorrecto</h3>
    <p class="small muted">Punto y saque para el rival. El acta sigue con la rotación correcta.</p>
    <div class="row" style="margin-bottom:14px">${['L', 'V'].map((eq) => `<button data-rot="${eq}">La comete ${esc(eqNombre(eq))}</button>`).join('')}</div>
    <h3 style="font-size:16px;margin:4px 0">Equipo incompleto o que se retira</h3>
    <p class="small muted">El rival gana los puntos y sets que le faltan; cada equipo conserva lo que ya había ganado. No se puede deshacer de otra forma que con Deshacer.</p>
    <div class="row">${['L', 'V'].map((eq) => `<button class="ghost" data-inc="${eq}" style="color:var(--warn)">${esc(eqNombre(eq))} incompleto</button>`).join('')}</div>
    <div class="row" style="margin-top:14px"><button class="ghost" data-cerrar>Cerrar</button></div>`);
  $('hojaC').querySelectorAll('[data-rot]').forEach((b) => (b.onclick = () => { if (!hacer({ t: 'faltaRotacion', eq: b.dataset.rot })) { cerrarHoja(); toast('Falta de rotación anotada: punto para el rival.', true); } }));
  $('hojaC').querySelectorAll('[data-inc]').forEach((b) => (b.onclick = () => { if (confirmar(`¿${eqNombre(b.dataset.inc)} no puede seguir (equipo incompleto o se retira)? El partido acaba aquí.`)) { if (!hacer({ t: 'incompleto', eq: b.dataset.inc, motivo: 'incompleto' })) cerrarHoja(); } }));
}

/* ---------- Directo: marcador público para quien tenga el enlace (sin nombres de jugadores) ---------- */
function resumenDirecto() {
  const s = M.setActual(ST), r = M.resultados(ST);
  return { local: A.datos.local || '', visitante: A.datos.visitante || '', competicion: A.datos.competicion || '', categoria: A.datos.categoria || '', pabellon: A.datos.pabellon || '', fecha: A.datos.fecha || '',
    fase: ST.fase, set: s.n, decisivo: s.decisivo, puntos: s.puntos, ganados: ST.ganados, saque: s.saque, izq: s.izq || 'L', tiempos: { L: s.tiempos.L.length, V: s.tiempos.V.length },
    sets: ST.sets.filter((x) => x.ganador).map((x) => ({ n: x.n, L: x.puntos.L, V: x.puntos.V })), ganador: r.ganador, actualizado: new Date().toISOString() };
}
let DIR_T = null;
function publicarDirecto(ahora) {
  if (!A?.directo) return;
  clearTimeout(DIR_T);
  DIR_T = setTimeout(async () => {
    try { const { error } = await sbc().from('acta_directo').upsert({ id: A.directo, estado: resumenDirecto(), updated_at: new Date().toISOString() }); if (error) throw error; }
    catch (e) { toast('No se ha podido actualizar el directo (¿sin conexión?). Se reintenta con el siguiente punto.'); }
  }, ahora ? 0 : 800);
}
const enlaceDirecto = () => new URL('directo/?id=' + A.directo, location.href).href;
async function hojaDirecto() {
  let session = null; try { ({ data: { session } } = await sbc().auth.getSession()); } catch (e) {}
  if (!session) { hoja(`<h2 id="hojaT">Directo</h2><p>Para emitir el marcador en directo tienes que haber entrado con tu cuenta de Vòlei EnXarxa en este navegador.</p><div class="row"><a class="btn primary" href="../">Entrar</a><button class="ghost" data-cerrar>Cerrar</button></div>`); return; }
  if (!A.directo) {
    hoja(`<h2 id="hojaT">Emitir en directo</h2><p class="small">Quien tenga el enlace verá el marcador en tiempo real: equipos, sets, puntos y quién saca. <b>No se publica ningún nombre de jugador.</b> Se borra a los 2 días.</p>
      <div class="row"><button class="primary" id="empezarDir">Empezar el directo</button><button class="ghost" data-cerrar>Cancelar</button></div>`);
    $('empezarDir').onclick = async () => {
      A.directo = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('') + Date.now().toString(36);
      guardar(); sbc().rpc('limpiar_directos').then(() => {}, () => {});
      publicarDirecto(true); pintar(); hojaDirecto();
    };
    return;
  }
  hoja(`<h2 id="hojaT">En directo</h2><p class="small muted">Pásalo por WhatsApp o ábrelo en una TV.</p>
    <label class="f"><span>Enlace</span><input type="text" id="dirUrl" readonly value="${esc(enlaceDirecto())}"></label>
    <div class="row"><button class="primary" id="copiarDir">Copiar el enlace</button><a class="btn" href="${esc(enlaceDirecto())}" target="_blank" rel="noopener">Abrir</a><button id="pararDir">Dejar de emitir</button><button class="ghost" data-cerrar>Cerrar</button></div>`);
  $('copiarDir').onclick = async () => { try { await navigator.clipboard.writeText(enlaceDirecto()); toast('Enlace copiado.', true); } catch (e) { $('dirUrl').select(); } };
  $('pararDir').onclick = async () => { const id = A.directo; A.directo = null; guardar(); try { await sbc().from('acta_directo').delete().eq('id', id); } catch (e) {} cerrarHoja(); pintar(); toast('Directo terminado.', true); };
}

function hojaSancion(eq) {
  let tipo = null, quien = null;
  const dibujar = () => {
    const js = ST.equipos[eq].jugadores, ofi = ST.equipos[eq].oficiales.map((o) => o.rol);
    const quienes = tipo === 'avisoRetraso' || tipo === 'castigoRetraso' || tipo === 'impropia' ? [['equipo', 'Equipo']] : [...js.map((j) => [j.num, String(j.num)]), ...ofi.map((r) => [r, M.ROLES_OFICIALES[r]])];
    $('hojaC').innerHTML = `<h2 id="hojaT">Sanción · ${esc(eqNombre(eq))}</h2>
      <b>Tipo</b><div class="botones">${Object.entries(SANC).map(([k, t]) => `<button data-tipo="${k}" aria-pressed="${tipo === k}" style="font-size:15px">${esc(t)}</button>`).join('')}</div>
      ${tipo ? `<b>A quién</b><div class="botones">${quienes.map(([k, t]) => `<button data-quien="${k}" aria-pressed="${String(quien) === String(k)}" style="font-size:15px">${esc(t)}</button>`).join('')}</div>` : ''}
      <p class="motivo">${tipo === 'castigo' || tipo === 'castigoRetraso' ? 'Da un punto y el saque al rival.' : tipo === 'expulsion' ? 'Fuera el resto del set: hay que sustituirlo.' : tipo === 'descalificacion' ? 'Fuera el resto del partido: hay que sustituirlo.' : tipo === 'impropia' ? 'Se anota sin sanción; si se repite en el partido, es retraso.' : ''}</p>
      <div class="row"><button class="primary" id="ok"${!tipo || quien == null ? ' disabled' : ''}>Anotar</button><button class="ghost" data-cerrar>Cancelar</button></div>`;
    $('hojaC').querySelectorAll('[data-tipo]').forEach((b) => (b.onclick = () => { tipo = b.dataset.tipo; quien = ['avisoRetraso', 'castigoRetraso', 'impropia'].includes(tipo) ? 'equipo' : null; dibujar(); }));
    $('hojaC').querySelectorAll('[data-quien]').forEach((b) => (b.onclick = () => { quien = b.dataset.quien; dibujar(); }));
    $('ok').onclick = () => {
      const err = tipo === 'impropia' ? hacer({ t: 'impropia', eq }) : hacer({ t: 'sancion', eq, quien, tipo });
      if (!err) { cerrarHoja(); const s = M.setActual(ST); if (s.pendienteSust[eq]?.length) setTimeout(() => hojaSust(eq), 200); }
    };
  };
  hoja('', () => { dibujar(); $('hojaC').querySelector('button')?.focus(); });
}
function hojaObs() {
  hoja(`<h2 id="hojaT">Observación</h2><p class="small muted">Retrasos, incidencias, protestas, lesiones… Se añade al acta con la hora.</p><label class="f"><span>Texto</span><textarea id="oTxt" maxlength="1000"></textarea></label>
    <div class="row"><button class="primary" id="oOk">Añadir</button><button class="ghost" data-cerrar>Cancelar</button></div>`);
  $('oOk').onclick = () => { const t = $('oTxt').value.trim(); if (!t) return; if (!hacer({ t: 'obs', texto: t })) { cerrarHoja(); toast('Observación añadida.', true); } };
}

/* ---------- Entre sets ---------- */
function pEntre() {
  const prev = ST.sets[ST.sets.length - 2], s = M.setActual(ST);
  $('app').innerHTML = pasos('entre') + `<section class="card"><h2>Fin del set ${prev.n}: ${esc(eqNombre(prev.ganador))} ${prev.puntos[prev.ganador]}-${prev.puntos[OTRO(prev.ganador)]}</h2>
      <p>Sets: ${esc(A.datos.local)} ${ST.ganados.L} – ${ST.ganados.V} ${esc(A.datos.visitante)}</p>
      ${s.decisivo ? '<p class="small muted">Set decisivo: hay sorteo, se juega a ' + ST.cfg.puntosDecisivo + ' y se cambia de campo cuando un equipo llega a ' + ST.cfg.cambioDecisivo + '.</p>' : `<p class="small muted">Cambio de campo. Saca primero ${esc(eqNombre(s.saqueInicial))}.</p>`}</section>
    ${s.decisivo ? `<section class="card"><h2>Sorteo del set decisivo</h2><fieldset><legend>Saca primero</legend>${opcionesEq('saca', s.saqueInicial)}</fieldset><fieldset><legend>A la izquierda del anotador</legend>${opcionesEq('izq', s.izq)}</fieldset></section>` : ''}
    <div class="grid2"><section class="card"><h2>${esc(A.datos.local)}</h2>${selectorAlineacion('L', s.alineacion.L || prev.alineacion.L)}</section><section class="card"><h2>${esc(A.datos.visitante)}</h2>${selectorAlineacion('V', s.alineacion.V || prev.alineacion.V)}</section></div>
    ${ST.castigosPendientes.length ? `<p class="msg err">Al empezar el set: ${ST.castigosPendientes.map((c) => `punto para ${esc(eqNombre(c.eq))} (${esc(SANC[c.tipo]).toLowerCase()})`).join(' · ')}.</p>` : ''}
    <div class="barra"><button class="primary" id="empezar">Empezar el set ${s.n}</button><button data-sanc-entre="L">Sanción ${esc(eqNombre('L'))}</button><button data-sanc-entre="V">Sanción ${esc(eqNombre('V'))}</button><button id="deshacer">Deshacer</button><button id="obs">Observación</button><button id="ver">Ver acta</button><button class="ghost" id="mis">Mis actas</button></div>`;
  enlazarAlineacion();
  $('empezar').onclick = () => empezarSet(s.decisivo);
  $('app').querySelectorAll('[data-sanc-entre]').forEach((b) => (b.onclick = () => hojaSancion(b.dataset.sancEntre)));
  barraComun();
}

/* ---------- Final ---------- */
function tablaResultados() {
  const r = M.resultados(ST);
  return `<table class="lista"><thead><tr><th>Set</th><th>Min.</th><th colspan="2">${esc(A.datos.local)}</th><th colspan="2">${esc(A.datos.visitante)}</th></tr></thead><tbody>
    ${r.filas.map((f) => `<tr><td>${f.set}</td><td>${f.duracion ?? ''}</td><td><b>${f.L.puntos}</b></td><td class="small muted">T ${f.L.tiempos} · S ${f.L.sust}</td><td><b>${f.V.puntos}</b></td><td class="small muted">T ${f.V.tiempos} · S ${f.V.sust}</td></tr>`).join('')}
    <tr><td><b>Total</b></td><td>${r.total.duracion}</td><td><b>${r.total.L.gana}</b></td><td></td><td><b>${r.total.V.gana}</b></td><td></td></tr></tbody></table>
    <p class="small muted">Inicio ${hora(r.inicio)} · fin ${hora(r.fin)} · duración del partido ${r.duracionPartido ?? ''} min.</p>`;
}
function pFinal() {
  pantallaEncendida(false);
  const r = M.resultados(ST);
  const inc = ST.incompleto;
  $('app').innerHTML = pasos('final') + `<section class="card"><h2>Gana ${esc(eqNombre(r.ganador))} ${Math.max(r.total.L.gana, r.total.V.gana)}-${Math.min(r.total.L.gana, r.total.V.gana)}</h2>${inc ? `<p class="msg err">${inc.motivo === 'incomparecencia' ? `Por incomparecencia de ${esc(eqNombre(inc.eq))}.` : `${esc(eqNombre(inc.eq))} se queda con el equipo incompleto en el set ${inc.set} (${inc.a}-${inc.b}).`}</p>` : ''}${tablaResultados()}</section>
    ${ST.cfg.setObligatorio ? setObligatorioHtml() : ''}
    <section class="card"><h2>Observaciones</h2>${ST.observaciones.length ? ST.observaciones.map((o) => `<p class="small">Set ${o.set} · ${hora(o.h)}: ${esc(o.texto)}</p>`).join('') : '<p class="small muted">Ninguna.</p>'}<button id="obs">Añadir observación</button></section>
    <section class="card"><h2>Firmas</h2><p class="small muted">Por este orden: capitanes, anotador ayudante, anotador, 2º árbitro y 1er árbitro.</p>${firmasHtml(FIRMAS)}</section>
    <div class="barra"><button class="primary" id="ver">Ver e imprimir el acta</button><button id="json">Descargar los datos (JSON)</button><button id="deshacer">Deshacer el último punto</button><button class="ghost" id="mis">Mis actas</button></div>`;
  enlazarFirmas(); barraComun();
  $('app').querySelectorAll('[data-sc]').forEach((c) => (c.onchange = () => { const [eq, num, set] = c.dataset.sc.split('|'); hacer({ t: 'setCompleto', eq, num, set: +set, si: c.checked }); }));
  $('json').onclick = () => { const b = new Blob([JSON.stringify(A, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `acta-${(A.datos.fecha || '')}-${(A.datos.local || '').replace(/\W+/g, '-')}.json`; a.click(); };
}

/* ---------- Set obligatorio (infantil) ---------- */
function setObligatorioHtml() {
  const sc = M.setsCompletos(ST), jugados = ST.sets.filter((x) => x.inicio);
  const faltan = ['L', 'V'].map((eq) => [eq, Object.values(sc[eq]).filter((x) => !x.cumple)]);
  const tabla = (eq) => `<div><h3 style="font-size:16px;margin:8px 0">${esc(eqNombre(eq))}</h3><table class="lista setob"><thead><tr><th>Nº</th><th>Jugador</th>${jugados.map((x) => `<th>Set ${x.n}</th>`).join('')}<th></th></tr></thead><tbody>
    ${Object.values(sc[eq]).map((j) => `<tr class="${j.cumple ? '' : 'nocumple'}"><td><b>${esc(j.num)}</b></td><td>${esc(j.nombre)}</td>${j.sets.map((x) => `<td><label class="chk"><input type="checkbox" data-sc="${eq}|${esc(j.num)}|${x.set}"${x.completo ? ' checked' : ''} aria-label="${esc(j.num)} set ${x.set} completo">${x.mano !== null ? '<span class="small muted" title="Marcado a mano">✎</span>' : ''}</label></td>`).join('')}<td>${j.cumple ? '<span class="ok-t">✓</span>' : '<span class="no-t">Sin set</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  return `<section class="card"><h2>Set obligatorio</h2>
    <p class="small muted">Marcado solo: los titulares de cada set que no han sido cambiados durante el set. Si algún caso no cuenta o sí cuenta (por ejemplo, un cambio especial), corrígelo con la casilla; queda señalado con ✎.</p>
    ${faltan.some(([, f]) => f.length) ? `<p class="msg err">Sin ningún set completo: ${faltan.filter(([, f]) => f.length).map(([eq, f]) => `${esc(eqNombre(eq))}: ${f.map((x) => esc(x.num)).join(', ')}`).join(' · ')}</p>` : '<p class="msg ok">Todos los jugadores han jugado al menos un set completo.</p>'}
    <div class="dos">${tabla('L')}${tabla('V')}</div></section>`;
}

/* ---------- Acta impresa ---------- */
function actaHtml() {
  const st = ST, d = A.datos, set1 = st.sets[0], eqA = set1.izq || 'L', eqB = OTRO(eqA);
  const ab = (eq) => (eq === eqA ? 'A' : 'B');
  const marc = (x) => `${x.a}:${x.b}`;
  const equipoTabla = (eq) => {
    const e = st.equipos[eq];
    return `<table><tr><th colspan="3">${ab(eq)} · ${esc(eqNombre(eq))}</th></tr><tr><th>Nº</th><th>Jugador</th><th></th></tr>
      ${e.jugadores.map((j) => `<tr><td>${j.num}</td><td class="izq">${esc(j.nombre)}</td><td>${j.cap ? 'C' : ''}${j.lib ? 'L' : ''}</td></tr>`).join('')}
      ${e.oficiales.map((o) => `<tr><td>${o.rol}</td><td class="izq" colspan="2">${esc(o.nombre)}</td></tr>`).join('')}</table>`;
  };
  const setBloque = (s) => {
    if (!s.inicio) return '';
    const lado = (eq) => {
      const al = s.alineacion[eq] || [];
      const turnos = POS.map((_, c) => s.turnos[eq].filter((t) => t.col === c).map((t) => t.hasta ?? '·').join(' '));
      const subs = POS.map((_, c) => s.sust[eq].filter((x) => { const t = al[c]; return x.sale === t || x.entra === t || s.parejas[eq][t] === x.sale || s.parejas[eq][t] === x.entra; }).map((x) => `${x.entra}<br>${marc(x)}`).join('<br>'));
      const max = Math.max(s.puntos[eq], objetivo(s));
      const pts = Array.from({ length: max }, (_, i) => { const n = i + 1, p = s.progreso.filter((x) => x.eq === eq)[i]; return `<span class="pt${p ? ' s' : ''}${p && p.motivo !== 'rally' ? ' c' : ''}">${n}</span>`; }).join(' ');
      return `<table><tr><th colspan="7">${ab(eq)} · ${esc(eqNombre(eq))} ${s.saqueInicial === eq ? '(saca)' : '(recibe)'}</th></tr>
        <tr><th></th>${POS.map((p) => `<th>${p}</th>`).join('')}</tr>
        <tr><th>Titular</th>${al.map((n) => `<td><b>${n}</b></td>`).join('')}</tr>
        <tr><th>Cambios</th>${subs.map((x) => `<td>${x}</td>`).join('')}</tr>
        <tr><th>Saque</th>${turnos.map((x) => `<td>${x}</td>`).join('')}</tr>
        <tr><th>Tiempos</th><td colspan="6" class="izq">${s.tiempos[eq].map(marc).join(' · ') || '—'}</td></tr>
        <tr><th>Líbero</th><td colspan="6" class="izq">${s.liberos[eq].map((x) => `${x.entra}↔${x.sale} ${marc(x)}`).join(' · ') || '—'}</td></tr>
        <tr><th>Puntos</th><td colspan="6" class="izq">${pts}</td></tr></table>`;
    };
    return `<div class="bloque"><table><tr><th class="izq">Set ${s.n}${s.decisivo ? ' (decisivo)' : ''} · inicio ${hora(s.inicio)} · fin ${hora(s.fin)} · ${s.puntos.L}-${s.puntos.V} ${esc(eqNombre('L'))}–${esc(eqNombre('V'))}${s.cambioHecho ? ' · cambio de campo a los ' + st.cfg.cambioDecisivo : ''}</th></tr></table>
      <div class="cols">${lado(eqA)}${lado(eqB)}</div></div>`;
  };
  const objetivo = (s) => (s.decisivo ? st.cfg.puntosDecisivo : st.cfg.puntosSet);
  const r = M.resultados(st);
  const firma = (rol, t) => { const f = st.firmas[rol]; return `<td><b>${esc(t)}</b><br>${f ? `<img src="${f.img}" alt=""><br>${esc(f.nombre)}` : ''}</td>`; };
  return `<h1>Acta del partido · ${esc(d.local)} – ${esc(d.visitante)}</h1>
    <table><tr><th>Competición</th><td class="izq">${esc(d.competicion)}</td><th>Categoría</th><td>${esc(d.categoria)}</td><th>Partido</th><td>${esc(d.partido)}</td><th>Fecha</th><td>${esc(d.fecha)}</td><th>Hora</th><td>${esc(d.hora)}</td></tr>
      <tr><th>Pabellón</th><td class="izq" colspan="3">${esc(d.pabellon)}</td><th>Población</th><td colspan="3">${esc(d.ciudad)}</td><th>Formato</th><td>Mejor de ${st.cfg.mejorDe}</td></tr></table>
    <div class="cols"><div>${equipoTabla(eqA)}</div><div>${equipoTabla(eqB)}</div></div>
    <table><tr><th>1er árbitro</th><td>${esc(d.r1)}</td><th>2º árbitro</th><td>${esc(d.r2)}</td><th>Anotador</th><td>${esc(d.an)}</td><th>Anot. ayudante</th><td>${esc(d.aa)}</td><th>Jueces de línea</th><td>${esc([d.jl1, d.jl2].filter(Boolean).join(', '))}</td></tr></table>
    <table><tr><th>Sorteos</th><td class="izq">${st.sorteos.map((x) => `Set ${x.set}: saca ${esc(eqNombre(x.saca))}; a la izquierda ${esc(eqNombre(x.izq))}`).join(' · ')}</td></tr></table>
    ${st.sets.map(setBloque).join('')}
    <div class="bloque"><table><tr><th colspan="7">Sanciones</th></tr><tr><th>Tipo</th><th>Equipo</th><th>Quién</th><th>Set</th><th>Marcador</th><th>Hora</th></tr>
      ${st.sanciones.map((x) => `<tr><td>${esc(SANC[x.tipo])}</td><td>${ab(x.eq)}</td><td>${esc(M.esDorsal(x.quien) ? x.quien : x.quien === 'equipo' ? 'Equipo' : x.quien)}</td><td>${x.set}</td><td>${marc(x)}</td><td>${hora(x.h)}</td></tr>`).join('') || '<tr><td colspan="6">—</td></tr>'}</table></div>
    <div class="bloque"><table><tr><th>Set</th><th>Min.</th><th>A T</th><th>A S</th><th>A G</th><th>A P</th><th>B P</th><th>B G</th><th>B S</th><th>B T</th></tr>
      ${r.filas.map((f) => { const a = f[eqA], b = f[eqB]; return `<tr><td>${f.set}</td><td>${f.duracion ?? ''}</td><td>${a.tiempos}</td><td>${a.sust}</td><td>${a.gana}</td><td>${a.puntos}</td><td>${b.puntos}</td><td>${b.gana}</td><td>${b.sust}</td><td>${b.tiempos}</td></tr>`; }).join('')}
      <tr><th>Total</th><td>${r.total.duracion}</td><td>${r.total[eqA].tiempos}</td><td>${r.total[eqA].sust}</td><td>${r.total[eqA].gana}</td><td>${r.total[eqA].puntos}</td><td>${r.total[eqB].puntos}</td><td>${r.total[eqB].gana}</td><td>${r.total[eqB].sust}</td><td>${r.total[eqB].tiempos}</td></tr></table>
      <table><tr><th>Inicio</th><td>${hora(r.inicio)}</td><th>Fin</th><td>${hora(r.fin)}</td><th>Duración</th><td>${r.duracionPartido ?? ''} min</td><th>Ganador</th><td>${r.ganador ? esc(eqNombre(r.ganador)) + ` ${Math.max(r.total.L.gana, r.total.V.gana)}:${Math.min(r.total.L.gana, r.total.V.gana)}` : ''}</td></tr></table></div>
    ${st.cfg.setObligatorio ? (() => { const sc = M.setsCompletos(st), js = st.sets.filter((x) => x.inicio); const t = (eq) => `<table><tr><th colspan="${js.length + 3}">Set obligatorio · ${ab(eq)} · ${esc(eqNombre(eq))}</th></tr><tr><th>Nº</th><th>Jugador</th>${js.map((x) => `<th>S${x.n}</th>`).join('')}<th>Cumple</th></tr>${Object.values(sc[eq]).map((j) => `<tr><td>${esc(j.num)}</td><td class="izq">${esc(j.nombre)}</td>${j.sets.map((x) => `<td>${x.completo ? 'X' : ''}${x.mano !== null ? '*' : ''}</td>`).join('')}<td>${j.cumple ? 'Sí' : '<b>NO</b>'}</td></tr>`).join('')}</table>`; return `<div class="bloque cols"><div>${t(eqA)}</div><div>${t(eqB)}</div></div><p style="font-size:9px;margin:-4px 0 6px">X = set completo (titular sin cambio) · * = corregido a mano por el anotador.</p>`; })() : ''}
    <div class="bloque"><table><tr><th class="izq">Observaciones</th></tr><tr><td class="izq">${[
      ...st.sets.flatMap((x) => x.repeticiones.map((r) => `Set ${x.n} ${hora(r.h)}: repetición de la jugada (${r.a}:${r.b}).`)),
      ...st.faltasRotacion.map((x) => `Set ${x.set} ${hora(x.h)}: falta de rotación de ${esc(st.equipos[x.eq].nombre || eqNombre(x.eq))} (${x.a}:${x.b}); punto para el rival.`),
      ...(st.incompleto ? [st.incompleto.motivo === 'incomparecencia' ? `Incomparecencia de ${esc(st.equipos[st.incompleto.eq].nombre || eqNombre(st.incompleto.eq))}: 0-3 (25-0).` : `Set ${st.incompleto.set} ${hora(st.incompleto.h)}: ${esc(st.equipos[st.incompleto.eq].nombre || eqNombre(st.incompleto.eq))} se queda con el equipo incompleto (${st.incompleto.a}:${st.incompleto.b}); el rival gana los puntos y sets que faltan.`] : []),
      ...['L', 'V'].flatMap((eq) => st.liberosFuera[eq].map((x) => `Set ${x.set} ${hora(x.h)}: el líbero ${esc(x.libero)} de ${esc(eqNombre(eq))} no puede seguir${x.nuevo ? `; nuevo líbero, el ${esc(x.nuevo)}` : ''} (${x.a}:${x.b}).`)),
      ...st.observaciones.map((o) => `Set ${o.set} ${hora(o.h)}: ${esc(o.texto)}`)].join('<br>') || '—'}</td></tr></table></div>
    <div class="bloque"><table><tr>${FIRMAS_PRE.map(([k, t]) => firma(k, t + ' (antes)')).join('')}</tr><tr>${FIRMAS.map(([k, t]) => firma(k, t)).join('')}</tr></table></div>
    <p style="font-size:9px">Acta electrónica de Vòlei EnXarxa (prototipo, no oficial). Generada el ${new Date().toLocaleString('es-ES')}.</p>`;
}
function pVer() {
  $('impresa').innerHTML = actaHtml();
  $('app').innerHTML = `<div class="barra"><button class="primary" id="imprimir">Imprimir o guardar en PDF</button><button id="volverActa">Volver</button></div>`;
  $('imprimir').onclick = () => print();
  $('volverActa').onclick = () => { VER = false; $('impresa').innerHTML = ''; pintar(); scrollTo(0, 0); };
}

/* ---------- Arranque ---------- */
window.pepperLoader?.show('Cargando el acta…');
window.addEventListener('error', (e) => { if (!LISTO) mostrarError(e.error || e.message); });
window.addEventListener('unhandledrejection', (e) => { if (!LISTO) mostrarError(e.reason); });
setTimeout(() => { if (!LISTO) mostrarError(new Error('La página está tardando demasiado en arrancar.')); }, 15000);
const id = new URLSearchParams(location.search).get('acta');
if (id) abrir(id); else pintar();
cargarMios();
})();
