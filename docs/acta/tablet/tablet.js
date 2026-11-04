// Tablet de árbitros y entrenadores del acta electrónica (4-nov-2026, specs/acta-tablets-alineacion.md; migración 039).
// Sin cuenta: el token del enlace (?t=) es la llave. Cada 2 s pregunta a tablet_estado(tok) → {rol, estado, edad,
// formaciones}. Árbitros: solo lectura (pistas, tiempos de descanso, sustituciones, sanciones, cuenta atrás de 30 s).
// Entrenadores: antes de cada set envían su formación inicial (FIVB 7.3.2 y 5.2.3.1; una vez enviada queda bloqueada,
// 7.3.4) y durante el set ven su equipo. Solo dorsales: ningún nombre de jugador. Las horas que se comparan con el reloj
// del anotador (reloj del set, cuenta atrás) se calculan con la edad que da el servidor, no con el reloj de la tablet.
(() => {
'use strict';
const M = window.ActaMotor, OTRO = M.OTRO, POS = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tr = (x) => (window.trActa ? window.trActa(x) : x);
const tok = (new URLSearchParams(location.search).get('t') || '').trim();
const sb = supabase.createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY);
const LIMITE = window.TABLET_LIMITE ?? 15;   // segundos sin datos del anotador → banda roja (el anotador publica cada 10 s)
const SANC = { amonestacion: 'Amonestación', castigo: 'Castigo', expulsion: 'Expulsión', descalificacion: 'Descalificación', avisoRetraso: 'Amonestación por demora', castigoRetraso: 'Castigo por demora' };
const ERRORES = { 'ya enviada': 'Ya habías enviado la formación de este set: no se puede cambiar. Si hay que cambiarla, avisa al anotador.', 'set empezado': 'El set ya ha empezado: la formación ya no se puede enviar.', 'no valida': 'La formación no es válida.', enlace: 'Este enlace ya no vale.' };

let R = null, EN = 0, ERR = false, NOVALE = false, FIRMA = '', PRIMERA = true, OCUPADO = false;
let ED = null;                                   // editor de la formación: { set, jug: [6 dorsales | null], sel: posición }
let ENV = { msg: '', mal: false, enviando: false };

const nomEq = (e, k) => (k === 'L' ? e.local : e.visitante) || (k === 'L' ? 'Local' : 'Visitante');
const miEq = () => (R?.rol === 'entL' ? 'L' : R?.rol === 'entV' ? 'V' : null);
const edad = () => (R ? Number(R.edad || 0) + (Date.now() - EN) / 1000 : Infinity);   // s desde la última publicación del anotador
const ahoraAnotador = () => Date.parse(R.estado.actualizado) + edad() * 1000;          // "ahora" con el reloj del anotador
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString(window.ACTA_LANG === 'ca' ? 'ca-ES' : 'es-ES', { hour: '2-digit', minute: '2-digit' }) : '');
const mmss = (seg) => `${Math.floor(seg / 60)}:${String(Math.floor(seg % 60)).padStart(2, '0')}`;
const hace = (s) => (s < 60 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);
const textoSobre = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.18 ? '#000' : '#fff'; };
const COLOR_DEF = { L: '#D2232A', V: '#FFD100', libL: '#1E5BC6', libV: '#1B8A3A' };
const colorDe = (e, k, lib) => { const key = lib ? 'lib' + k : k, c = e.colores?.[key]; return /^#[0-9a-f]{6}$/i.test(c || '') ? c : COLOR_DEF[key]; };
const estilo = (e, k, lib) => { const c = colorDe(e, k, lib); return `--c:${c};--ct:${textoSobre(c)}`; };
const enPista = (q) => (q.rot ? q.rot.map((n, i) => (q.libero && q.libero.pos === i ? q.libero.num : n)) : null);
const alineables = (q) => q.plantilla.filter((j) => !j.lib && !q.noPuede.includes(j.num));

/* ---------- Datos ---------- */
async function cargar() {
  if (OCUPADO) return; OCUPADO = true;
  if (PRIMERA) window.pepperLoader?.show('Conectando con la mesa…');
  try {
    if (!/^[a-z0-9]{24,48}$/.test(tok)) { NOVALE = true; pintar(); return; }
    const { data, error } = await sb.rpc('tablet_estado', { tok });
    if (error) throw error;
    ERR = false;
    if (!data) { NOVALE = true; R = null; } else { NOVALE = false; R = data; EN = Date.now(); }
    pintar();
  } catch (e) { ERR = true; if (!R) pintar(); }
  finally { OCUPADO = false; if (PRIMERA) { PRIMERA = false; window.pepperLoader?.done(); } tic(); }
}

/* ---------- Pintar (solo si algo ha cambiado: el latido del anotador no repinta) ---------- */
function pintar(forzar) {
  const firma = JSON.stringify([NOVALE, R?.rol, R ? { ...R.estado, actualizado: 0 } : null, R?.formaciones, ED, ENV]);
  if (firma === FIRMA && !forzar) return; FIRMA = firma;
  const foco = document.activeElement?.dataset?.k;
  if (NOVALE) {
    $('rol').textContent = 'Acta electrónica'; $('sub').textContent = '';
    $('m').innerHTML = '<p class="aviso">Este enlace ya no vale: el anotador ha dejado de compartir o ha creado enlaces nuevos. Pídele el enlace otra vez.</p>';
    return;
  }
  if (!R) { $('m').innerHTML = '<p class="aviso">No se puede conectar con la mesa. Se reintenta cada pocos segundos…</p>'; return; }
  const e = R.estado || {}, k = miEq();
  document.body.classList.toggle('arb', R.rol === 'arbitro');
  $('rol').innerHTML = R.rol === 'arbitro' ? '<span>Árbitros</span>' : `<span>Entrenador</span> · <span data-noi18n>${esc(e.eq ? nomEq(e, k) : '')}</span>`;
  $('sub').innerHTML = e.eq ? `<span data-noi18n>${esc(nomEq(e, 'L'))} – ${esc(nomEq(e, 'V'))}${e.competicion ? ' · ' + esc(e.competicion) : ''}</span>` : '';
  if (!e.eq) { $('m').innerHTML = '<p class="aviso">Esperando los datos del anotador…</p>'; return; }
  document.title = `${e.puntos[e.izq || 'L']}-${e.puntos[OTRO(e.izq || 'L')]} · ${nomEq(e, 'L')} – ${nomEq(e, 'V')}`;
  $('m').innerHTML = R.rol === 'arbitro' ? vistaArbitro(e) : vistaEntrenador(e, k);
  // Lector de pantalla: el marcador se repinta entero (su aria-live no avisaría); se anuncia desde una región fija.
  const anuncio = e.fase === 'juego' ? `${nomEq(e, 'L')} ${e.puntos.L}, ${nomEq(e, 'V')} ${e.puntos.V}` : '';
  if ($('anuncio').textContent !== anuncio) $('anuncio').textContent = anuncio;
  enlazar();
  if (foco) document.querySelector(`[data-k="${foco}"]`)?.focus();
  tic();
}

function marcador(e) {
  const izq = e.izq || 'L', der = OTRO(izq), juego = e.fase === 'juego';
  const lado = (k, d) => {
    const partes = [`<span class="s" title="Sets">${esc(e.ganados[k])}</span>`, juego && e.saque === k ? '<span class="balon" role="img" aria-label="Saca"></span>' : '',
      `<span class="muestra" style="background:${colorDe(e, k)}" aria-hidden="true"></span>`, `<span data-noi18n>${esc(nomEq(e, k))}</span>`];
    return `<div class="eq${d ? ' d' : ''}">${(d ? partes.reverse() : partes).join('')}</div>`;
  };
  const pts = juego ? `${esc(e.puntos[izq])}<span class="g">–</span>${esc(e.puntos[der])}` : `${esc(e.ganados[izq])}<span class="g">–</span>${esc(e.ganados[der])}`;
  const info = e.fase === 'fin' ? `<span>Partido acabado</span> · <span>gana</span> <span data-noi18n>${esc(nomEq(e, e.ganador))}</span>`
    : e.fase === 'juego' ? `<span>${e.golden ? 'Golden set' : e.decisivo ? `Set ${esc(e.set)} · decisivo` : `Set ${esc(e.set)}`}</span> · <span id="reloj" aria-label="Tiempo del set">0:00</span>`
    : e.fase === 'preparacion' ? `<span>Antes del partido · empieza el set ${esc(e.set)}</span>` : `<span>Intervalo · empieza el set ${esc(e.set)}</span>`;
  return `<div class="marc">${lado(izq)}<div class="pts">${pts}</div>${lado(der, true)}</div>
    <p class="setinfo">${info}</p>
    ${e.sets.length ? `<div class="hist">${e.sets.map((x) => `<span>Set ${esc(x.n)} · ${esc(x[izq])}-${esc(x[der])}</span>`).join('')}</div>` : ''}`;
}
// Cuenta atrás del tiempo de descanso (FIVB 15.4.1): la pinta tic() mientras dura.
const crono = (e) => (e.fase === 'juego' && e.ultimoTiempo ? `<div class="crono hidden" id="crono" role="timer" aria-live="off"><span>Tiempo de descanso</span> <span data-noi18n>${esc(nomEq(e, e.ultimoTiempo.eq))}</span> <b id="cronoN"></b></div>` : '');

function pistas(e) {
  const izq = e.izq || 'L', der = OTRO(izq);
  const campo = (k, orden, cl) => {
    const q = e.eq[k], r = enPista(q);
    if (!r) return `<div class="campo ${cl}"><div class="vacio" style="grid-row:1/-1">Sin formación todavía</div></div>`;
    return `<div class="campo ${cl}" data-noi18n>${orden.map((i) => {
      const n = r[i], j = q.plantilla.find((x) => x.num === n), lib = !!(q.libero && q.libero.pos === i), saca = e.saque === k && i === 0 && e.fase === 'juego', cap = j?.cap || q.capJuego === n;
      const et = `${n}, ${tr('posición')} ${POS[i]}${lib ? `, ${tr('líbero')} ${tr('por')} ${q.libero.por}` : ''}${saca ? ', ' + tr('saca') : ''}${cap ? ', ' + tr(j?.cap ? 'capitán' : 'capitán en juego') : ''}`;
      return `<div class="jug${lib ? ' lib' : ''}${saca ? ' saca' : ''}" style="${estilo(e, k, lib)}" role="img" aria-label="${esc(et)}"><span class="n">${esc(n)}</span>${cap ? `<span class="cap${j?.cap ? '' : ' cj'}" aria-hidden="true">C</span>` : ''}${saca ? '<span class="pelota" aria-hidden="true"></span>' : ''}<span class="pos" aria-hidden="true">${POS[i]}${lib ? ` · ${esc(tr('por'))} ${esc(q.libero.por)}` : ''}</span></div>`;
    }).join('')}</div>`;
  };
  return `<section class="cancha" aria-label="Pistas"><div class="c-nom" data-noi18n><span>${esc(nomEq(e, izq))}</span><span>${esc(nomEq(e, der))}</span></div>
    <div class="c-pista">${campo(izq, [4, 3, 5, 2, 0, 1], 'i')}<div class="red" aria-hidden="true"></div>${campo(der, [1, 0, 2, 5, 3, 4], 'd')}</div>
    <p class="c-mesa">Vista desde la mesa del anotador</p></section>`;
}

function panel(e, k, cl) {
  const q = e.eq[k], nT = q.tiempos.length, nS = q.sustUsadas, maxT = e.tiemposMax, maxS = e.sustMax, juego = e.fase === 'juego';
  const sanc = e.sanciones.filter((x) => x.eq === k);
  const quien = (x) => (M.esDorsal(x) ? x : x === 'equipo' ? tr('Equipo') : tr(M.ROLES_OFICIALES[x] || x));
  const vuelven = Object.entries(q.parejas).map(([t, s]) => (q.cerradas.includes(t) ? `<li>El ${esc(t)} y el ${esc(s)} ya no pueden sustituirse más en este set.</li>` : `<li>El ${esc(t)} solo puede volver por el ${esc(s)}.</li>`)).join('');
  return `<section class="pan ${cl}" data-eq="${k}"><h3><span class="muestra" style="background:${colorDe(e, k)}" aria-hidden="true"></span><span data-noi18n>${esc(nomEq(e, k))}</span></h3>
    <div class="fila${juego && nT >= maxT ? ' ojo' : ''}"><span>Tiempos de descanso</span><b>${esc(nT)}/${esc(maxT)}</b></div>
    <div class="fila${juego && nS >= maxS - 1 ? ' ojo' : ''}"><span>Sustituciones</span><b>${esc(nS)}/${esc(maxS)}</b></div>
    ${juego && nS >= maxS ? `<p class="alerta">Ya ha hecho las ${esc(maxS)} sustituciones del set.</p>` : juego && nS === maxS - 1 && nS > 0 ? `<p class="alerta">${esc(nS)}ª sustitución: le queda una.</p>` : ''}
    ${q.pendienteSust.length ? `<p class="alerta">Tiene que sustituir al ${q.pendienteSust.map(esc).join(', ')}.</p>` : ''}
    ${juego && q.necesitaCapitan ? '<p class="alerta">Falta capitán en juego.</p>' : ''}
    ${q.capJuego ? `<p class="nota">Capitán en juego: el ${esc(q.capJuego)}.</p>` : ''}
    ${q.libero ? `<p class="nota">Líbero ${esc(q.libero.num)} en pista por el ${esc(q.libero.por)}.</p>` : ''}
    ${q.sust.length ? `<h4>Sustituciones del set</h4><ul>${q.sust.map((x) => `<li><b data-noi18n>${esc(x.sale)} → ${esc(x.entra)}</b> <span class="m" data-noi18n>${esc(x.a)}:${esc(x.b)}</span>${x.tipo === 'excepcional' ? ' <span class="tag r">excepcional</span>' : ''}</li>`).join('')}</ul>` : ''}
    ${vuelven ? `<h4>Quién puede volver</h4><ul>${vuelven}</ul>` : ''}
    ${nT ? `<h4>Tiempos de descanso</h4><ul>${q.tiempos.map((t) => `<li data-noi18n>${esc(t.a)}:${esc(t.b)}</li>`).join('')}</ul>` : ''}
    ${sanc.length ? `<h4>Sanciones</h4><ul>${sanc.map((x) => `<li><span class="tarjeta t-${esc(x.tipo)}" aria-hidden="true"></span><span>${esc(SANC[x.tipo] || x.tipo)}</span> · <span data-noi18n>${esc(quien(x.quien))}</span> <span class="m">set ${esc(x.set)}, ${esc(x.a)}:${esc(x.b)}</span></li>`).join('')}</ul>` : ''}
  </section>`;
}

const form6 = (jug) => `<div class="form6" data-noi18n><div class="red6" aria-hidden="true"></div>${[3, 2, 1, 4, 5, 0].map((i) => `<span aria-label="${esc(`${tr('Posición')} ${POS[i]}: ${jug[i]}`)}">${esc(jug[i])}<small>${POS[i]}</small></span>`).join('')}</div>`;

/* ---------- Árbitros ---------- */
function vistaArbitro(e) {
  const izq = e.izq || 'L', der = OTRO(izq);
  if (e.fase === 'juego') return marcador(e) + crono(e) + `<div class="juego">${panel(e, izq, 'i')}${pistas(e)}${panel(e, der, 'd')}</div>`;
  if (e.fase === 'fin') return marcador(e) + `<div class="grid2">${panel(e, 'L', 'i')}${panel(e, 'V', 'd')}</div>`;
  // Antes del partido o en el intervalo: formaciones del set que va a empezar en cuanto llegan (decisión de Ferran, 4-nov:
  // como en papel, el 2º árbitro las recibe y las comprueba en pista). Al entrenador rival no le llegan.
  const n = e.set;
  return marcador(e) + `<div class="grid2">${['L', 'V'].map((k) => {
    const f = (R.formaciones || []).find((x) => x.eq === k && x.set === n);
    return `<section class="pan" data-eq="${k}"><h3><span class="muestra" style="background:${colorDe(e, k)}" aria-hidden="true"></span><span data-noi18n>${esc(nomEq(e, k))}</span></h3>
      <h4>Formación inicial del set ${esc(n)}</h4>
      ${f ? `${form6(f.jugadores)}<p class="small"><span>Enviada por el entrenador a las</span> <span data-noi18n>${esc(hora(f.enviada))}</span>${e.recibidas?.[k] === n ? ' · <span>el anotador ya la tiene</span>' : ''}</p>`
        : '<p class="small muted">Todavía no ha llegado la formación del entrenador por la tablet (puede darla en papel).</p>'}
    </section>`;
  }).join('')}</div>`;
}

/* ---------- Entrenadores ---------- */
function vistaEntrenador(e, k) {
  if (e.fase === 'fin') return marcador(e) + '<p class="aviso">Partido acabado.</p>';
  if (e.abierta) return marcador(e) + formacion(e, k, e.abierta);
  if (e.fase === 'juego') return marcador(e) + crono(e) + `<div class="juego ent">${pistas(e)}${panel(e, k, 'i')}</div>`;
  return marcador(e);
}
function formacion(e, k, n) {
  const q = e.eq[k], mia = (R.formaciones || []).find((f) => f.eq === k && f.set === n);
  if (mia) {
    return `<section class="card"><h2>Formación inicial · set ${n}</h2>
      <div class="estado-env"><p class="ok-env" style="margin:0"><span>Enviada a las</span> <span data-noi18n>${esc(hora(mia.enviada))}</span></p>
      <p style="margin:0" role="status">${e.recibidas?.[k] === n ? '<b>Recibida por el anotador.</b>' : '<span>Esperando a que el anotador la reciba…</span>'}</p></div>
      ${form6(mia.jugadores)}
      <p class="small muted">Bloqueada: una vez enviada no se puede cambiar (FIVB 7.3.4). Si hay que cambiarla, avisa al anotador.</p>
      ${ENV.msg ? `<p class="msg ${ENV.mal ? 'err' : 'ok'}">${esc(ENV.msg)}</p>` : ''}</section>`;
  }
  const alin = alineables(q);
  if (!ED || ED.set !== n) {
    const prop = (q.anterior || []).map((x) => (alin.some((j) => j.num === x) ? x : null));
    const jug = Array.from({ length: 6 }, (_, i) => prop[i] || null);
    ED = { set: n, jug, sel: Math.max(0, jug.indexOf(null)) }; ENV = { msg: '', mal: false, enviando: false };
  }
  const faltan = ED.jug.filter((x) => !x).length, err = faltan ? null : validarForm(e, k, ED.jug);
  const etPos = (i) => `Posición ${POS[i]}: ${ED.jug[i] || 'vacía'}`;
  return `<section class="card"><h2>Formación inicial · set ${n}</h2>
    <p class="small">Toca una posición y después el dorsal del jugador. Red arriba: I = zaguero derecho, el que saca.</p>
    <div class="ed">
      <div><div class="ed-pista" role="group" aria-label="Posiciones"><div class="red6" aria-hidden="true"></div>${[3, 2, 1, 4, 5, 0].map((i) => `<button type="button" data-k="pos${i}" data-pos="${i}" aria-pressed="${ED.sel === i}" class="${ED.jug[i] ? '' : 'vacia'}" aria-label="${esc(etPos(i))}"><span data-noi18n>${esc(ED.jug[i] || '—')}</span><small data-noi18n>${POS[i]}</small></button>`).join('')}</div>
        <p class="small muted" style="margin:6px 0 0">Posición elegida: <b data-noi18n>${POS[ED.sel]}</b></p></div>
      <div><h3 class="small" style="margin:0 0 6px">Dorsales</h3>
        <div class="dorsales" role="group" aria-label="Dorsales">${alin.map((j) => { const usado = ED.jug.includes(j.num); return `<button type="button" data-k="d${esc(j.num)}" data-dorsal="${esc(j.num)}" class="${usado ? 'usado' : ''}"${usado ? ' disabled' : ''} aria-label="${esc(`Dorsal ${j.num}${j.cap ? ' (capitán)' : ''}${usado ? ' (ya colocado)' : ''}`)}"><span data-noi18n>${esc(j.num)}</span>${j.cap ? '<small data-noi18n>(C)</small>' : ''}</button>`; }).join('')}</div>
        <p class="small muted">Sin los líberos ni los que no pueden jugar.</p>
        <div class="row"><button type="button" data-k="vaciar" id="vaciar">Vaciar la posición</button><button type="button" class="ghost" data-k="limpiar" id="limpiar">Empezar de nuevo</button></div></div>
    </div>
    <p class="lista-msg ${err ? 'msg err' : 'small muted'}" role="status">${err ? esc(err) : faltan === 1 ? 'Falta 1 posición por completar.' : faltan === 1 ? 'Falta 1 posición por completar.' : faltan === 1 ? 'Falta 1 posición por completar.' : faltan ? `Faltan ${faltan} posiciones por completar.` : 'Formación completa: revísala y envíala.'}</p>
    ${ENV.msg ? `<p class="msg ${ENV.mal ? 'err' : 'ok'}" role="alert">${esc(ENV.msg)}</p>` : ''}
    <button type="button" class="primary enviar" id="enviar" data-k="enviar"${faltan || err || ENV.enviando ? ' disabled' : ''}>Enviar la formación del set ${n}</button>
    <p class="small muted">Una vez enviada no se puede cambiar. No verás la formación del rival hasta que empiece el set.</p></section>`;
}
// Las mismas reglas que el acta del anotador (motor.js): 6 distintos, inscritos, ni líberos ni descalificados.
function validarForm(e, k, jug) {
  try {
    const st = M.nuevo({ liberos: e.liberos, maxJugadores: 99 }, {});
    for (const x of ['L', 'V']) M.aplicar(st, { t: 'equipo', eq: x, nombre: '', jugadores: e.eq[x].plantilla.map((j) => ({ num: j.num, nombre: '', ...(j.cap ? { cap: true } : {}), ...(j.lib && !e.eq[x].noPuede.includes(j.num) ? { lib: true } : {}) })), oficiales: [] });   // un líbero impedido (re-designado) ya no cuenta como líbero
    for (const n of e.eq[k].noPuede) st.descalificados[k].add(n);
    M.aplicar(st, { t: 'alineacion', eq: k, jugadores: jug });
    return null;
  } catch (x) { return x instanceof M.ErrorActa ? x.message : 'No se puede comprobar la formación.'; }
}
async function enviar() {
  const e = R.estado, k = miEq(), n = ED.set, jug = [...ED.jug];
  if (jug.some((x) => !x) || validarForm(e, k, jug)) return;
  if (!confirm(tr(`Una vez enviada no se puede cambiar (FIVB 7.3.4). ¿Enviar la formación del set ${n}?`))) return;
  ENV = { msg: 'Enviando…', mal: false, enviando: true }; pintar();
  try {
    const { data, error } = await sb.rpc('tablet_enviar_formacion', { tok, n, dorsales: jug });
    if (error) throw error;
    ENV = data?.ok ? { msg: '', mal: false, enviando: false } : { msg: ERRORES[data?.error] || 'No se ha podido enviar.', mal: true, enviando: false };
  } catch (x) { ENV = { msg: 'No se ha podido enviar (¿sin conexión?). Vuelve a intentarlo.', mal: true, enviando: false }; }
  OCUPADO = false; await cargar(); pintar(true);
}
function enlazar() {
  const m = $('m');
  m.querySelectorAll('[data-pos]').forEach((b) => (b.onclick = () => { ED.sel = +b.dataset.pos; ENV.msg = ''; pintar(true); }));
  m.querySelectorAll('[data-dorsal]').forEach((b) => (b.onclick = () => {
    if (ED.jug.includes(b.dataset.dorsal)) return;   // un dorsal ya colocado no se puede repetir
    ED.jug[ED.sel] = b.dataset.dorsal; ENV.msg = '';
    const sig = [1, 2, 3, 4, 5, 6].map((d) => (ED.sel + d) % 6).find((i) => !ED.jug[i]);   // siguiente posición vacía (orden I…VI)
    if (sig != null) ED.sel = sig;
    pintar(true);
  }));
  if ($('vaciar')) $('vaciar').onclick = () => { ED.jug[ED.sel] = null; pintar(true); };
  if ($('limpiar')) $('limpiar').onclick = () => { ED.jug = [null, null, null, null, null, null]; ED.sel = 0; pintar(true); };
  if ($('enviar')) $('enviar').onclick = enviar;
}

/* ---------- Cada medio segundo: edad de los datos, banda roja, reloj del set y cuenta atrás ---------- */
function tic() {
  const banda = $('banda'), pie = $('pie');
  if (NOVALE || !R) { banda.classList.add('hidden'); pie.textContent = ERR ? 'Sin conexión: se reintenta…' : ''; return; }
  const s = edad(), e = R.estado || {};
  const txtPie = `${ERR ? 'Sin conexión: se reintenta… · ' : ''}Actualizado hace ${hace(s)}`;
  if (pie.dataset.t !== txtPie) { pie.dataset.t = txtPie; pie.textContent = txtPie; }
  const vieja = s > LIMITE && e.fase !== 'fin';
  banda.classList.toggle('hidden', !vieja);
  if (vieja) { const t = `Sin datos del anotador desde hace ${hace(s)}: puede estar desactualizado.`; if (banda.dataset.t !== t) { banda.dataset.t = t; banda.textContent = t; } }
  if (!e.actualizado) return;
  const reloj = $('reloj');
  if (reloj && e.inicioSet) { const t = mmss(Math.max(0, (ahoraAnotador() - Date.parse(e.inicioSet)) / 1000)); if (reloj.textContent !== t) reloj.textContent = t; }
  const c = $('crono');
  if (c && e.ultimoTiempo) {
    const dur = e.duracionTiempo || 30, resta = dur - (ahoraAnotador() - Date.parse(e.ultimoTiempo.h)) / 1000;
    const ver = resta > 0 && resta <= dur;
    c.classList.toggle('hidden', !ver);
    if (ver) $('cronoN').textContent = String(Math.ceil(resta));
  }
}

// Pantalla siempre encendida mientras se mira (si el navegador lo permite).
let BLOQ = null;
const encendida = async () => { try { if (!BLOQ && 'wakeLock' in navigator && document.visibilityState === 'visible') { BLOQ = await navigator.wakeLock.request('screen'); BLOQ.addEventListener('release', () => { BLOQ = null; }); } } catch (e) { BLOQ = null; } };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { encendida(); cargar(); } });
encendida();
cargar(); setInterval(cargar, 2000); setInterval(tic, 500);
})();
