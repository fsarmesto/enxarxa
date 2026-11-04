// Panel del designador: lo visual (4-nov-2026, Ferran: "que le entre por los ojos" a Albert).
// - Cuadrícula por pabellón y hora (bloques de color: con R1, sin R1, choque, ya con árbitro en iSquad, propuesta).
// - Mapa (SVG, sin servicios de fuera: el contorno de Catalunya está en catalunya.js).
// - Un color por árbitro y barra lateral con su carga (partidos, km aprox. de ida y vuelta, franjas libres).
// - Barras de progreso, propuesta automática, "toda una franja a…", casilla "Pasado a iSquad" y mensaje de WhatsApp.
// Usa lo que define el script de index.html (D, PLAN, choque, candidatos, tarjeta, asignar, api…): se carga después.

let PROP = null, PROP_SIN = 0;   // propuesta automática en revisión: [{key, rol:'r1', disp_id}]
let RESALTA = null;              // árbitro tocado en la barra lateral: se atenúa lo demás
let MAPA_ZONA = 'cat', MAPA_SEL = null, FICHA = null, FR = null;
let VISTA = (() => { try { return localStorage.getItem('designa-vista') || (innerWidth >= 900 ? 'rejilla' : 'lista'); } catch (e) { return innerWidth >= 900 ? 'rejilla' : 'lista'; } })();

/* ---------- Colores de los árbitros ---------- */
// 12 colores que se distinguen bien entre sí y de los de estado (verde, amarillo, rojo); texto blanco encima.
const COLORES = ['#2563EB', '#9333EA', '#C2410C', '#0E7490', '#DB2777', '#4D7C0F', '#4F46E5', '#0F766E', '#92400E', '#7C3AED', '#BE185D', '#475569'];
function colorDe(a) { const i = D.disp.findIndex(x => x.id === a.id); return COLORES[(i < 0 ? 0 : i) % COLORES.length]; }
const iniciales = n => corto(n).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const chipArb = a => a ? `<span class="ini" style="--c:${colorDe(a)}" aria-hidden="true">${esc(iniciales(a.nombre))}</span>` : '';
// Plan guardado, sin la propuesta (para el progreso y el WhatsApp).
const planGuardado = () => { const p = {}; for (const x of D.asig) (p[x.match_key] ||= {})[x.rol] = x.disp_id; return p; };
const esPropuesta = key => !!PROP && PROP.some(x => x.key === key) && !D.asig.some(x => x.match_key === key && x.rol === 'r1');
const suyo = (m, plan, id) => Object.values(plan[m.key] || {}).includes(id);

/* ---------- Progreso ---------- */
function progresoHtml(plan, liga, disp) {
  const g = planGuardado();
  const barra = (a, b, cls = '') => `<span class="pbar ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="${b}" aria-valuenow="${a}"><i style="width:${b ? Math.round(a / b * 100) : 0}%"></i></span>`;
  const dias = [['sab', t('sabado')], ['dom', t('domingo')]].map(([d, l]) => {
    const ms = liga.filter(m => dia(m) === d); if (!ms.length) return '';
    const c = ms.filter(m => g[m.key]?.r1).length;
    return `<div class="prog"><div class="pt"><b>${esc(l)}</b><span>${esc(t('progR1')(c, ms.length))}</span></div>${barra(c, ms.length, c === ms.length ? 'full' : '')}</div>`;
  }).join('');
  const h = liga.filter(m => HECHO().has(m.key)).length;
  return dias + `<div class="prog"><div class="pt"><b>iSquad</b><span>${esc(t('progHecho')(h, liga.length))}</span></div>${barra(h, liga.length, 'hecho')}</div>`
    + `<div class="kmini">${esc(t('progDisp')(disp))}${D.estadoIsquad ? ' · ' + esc(t('progSinIsq')(liga.filter(m => m.isquad === 'sin').length)) : ''}</div>`;
}

/* ---------- Pestaña Partidos ---------- */
function pintarVistaPartidos(plan) {
  $('vPart').classList.remove('hidden'); $('vArb').classList.add('hidden');
  $('vistas').innerHTML = [['rejilla', t('vRejilla')], ['lista', t('vLista')], ['mapa', t('vMapa')]]
    .map(([v, l]) => `<label><input type="radio" name="vista" value="${v}"${v === VISTA ? ' checked' : ''}><span>${esc(l)}</span></label>`).join('');
  pintarProp(); pintarLado(plan);
  const ms = filtrados(plan);
  const cab = (D.disp.length ? '' : `<p class="msg err">${esc(t('sinArb'))}</p>`) + `<p class="small muted">${esc(t('planNota'))}</p>`;
  if (VISTA === 'lista') { pintarPartidos(plan, ms); $('lista').insertAdjacentHTML('afterbegin', cab); }
  else if (VISTA === 'mapa') $('lista').innerHTML = cab + mapaHtml(plan, ms);
  else $('lista').innerHTML = cab + leyenda() + rejillaHtml(plan, ms);
  $('lista').classList.toggle('resalta', !!RESALTA);
  if (RESALTA) $('lista').querySelectorAll('[data-key]').forEach(el => el.classList.toggle('suyo', Object.values(plan[el.dataset.key] || {}).includes(RESALTA)));
}
function leyenda() {
  return `<p class="leyenda"><span>${esc(t('leyenda'))}</span><span><i class="sw ok"></i>${esc(t('lOk'))}</span><span><i class="sw falta"></i>${esc(t('lFalta'))}</span>`
    + `<span><i class="sw mal"></i>${esc(t('lMal'))}</span>${D.estadoIsquad ? `<span><i class="sw isq"></i>${esc(t('lIsq'))}</span>` : ''}<span><i class="sw prop"></i>${esc(t('lProp'))}</span><span>✓ ${esc(t('lHecho'))}</span></p>`;
}

/* ---------- Cuadrícula ---------- */
const DUR = 90;   // cada partido ocupa 1 h 30
let PX = 1.3;     // px por minuto: se ajusta para que el día quepa sin desplazarse (entre 1,05 y 1,6)
function estado(m, plan) {
  const p = plan[m.key] || {}, arb = ARB();
  const mal = ['r1', 'r2', 'an'].some(rol => { const a = arb[p[rol]]; if (!a) return false;
    const sinEste = { ...plan, [m.key]: Object.fromEntries(Object.entries(p).filter(([r]) => r !== rol)) }; return choque(a, m, sinEste)?.tipo === 'pisa'; });
  return mal ? 'mal' : p.r1 ? 'ok' : m.isquad === 'con' ? 'isq' : 'falta';
}
const estadoTxt = { ok: 'lOk', falta: 'lFalta', mal: 'lMal', isq: 'lIsq' };
function bloque(m, carril, plan, h0, arb) {
  const p = plan[m.key] || {}, st = estado(m, plan), prop = esPropuesta(m.key), hecho = HECHO().has(m.key);
  const quien = ['r1', 'r2', 'an'].map(r => arb[p[r]]).filter(Boolean);
  const etiqueta = `${m.d.slice(11, 16)} · ${cat(m.cat)} · ${corto(m.l)} – ${corto(m.v)} · ${t(estadoTxt[st])}${quien.length ? ' · ' + quien.map(a => corto(a.nombre)).join(', ') : ''}${prop ? ' · ' + t('propuesto') : ''}${hecho ? ' · ' + t('hecho') : ''}`;
  return `<button type="button" class="blq ${st}${prop ? ' prop' : ''}" data-key="${esc(m.key)}" data-ver style="left:${(mins(m) - h0 * 60) * PX}px;top:calc(${carril} * var(--alto))" aria-label="${esc(etiqueta)}" title="${esc(etiqueta)}">`
    + `<span class="bh">${esc(m.d.slice(11, 16))}${hecho ? ' <span aria-hidden="true">✓</span>' : ''}</span><span class="bc">${esc(cat(m.cat))}</span>`
    + `<span class="bq">${quien.length ? quien.map(chipArb).join('') : `<span class="vacio">${esc(t(st === 'isq' ? 'enIsqB' : 'lFalta'))}</span>`}</span></button>`;
}
function rejillaHtml(plan, ms) {
  if (!ms.length) return `<p class="muted">${esc(t('sinPartidos'))}</p>`;
  const arb = ARB(); let html = '';
  for (const d of [...new Set(ms.map(m => m.d.slice(0, 10)))]) {
    const md = ms.filter(m => m.d.slice(0, 10) === d);
    const h0 = Math.floor(Math.min(...md.map(mins)) / 60), h1 = Math.ceil((Math.max(...md.map(mins)) + DUR) / 60);
    const pabw = innerWidth <= 900 ? 118 : 170, libre = ($('lista').clientWidth || 800) - pabw - 16;
    PX = Math.max(1.05, Math.min(1.6, libre / ((h1 - h0) * 60)));
    const filas = new Map();
    for (const m of md) { const k = sinPista(m.pab); if (!filas.has(k)) filas.set(k, { k, pab: m.pab, pob: pobDe(m), ms: [] }); filas.get(k).ms.push(m); }
    const orden = [...filas.values()].sort((a, b) => corto(a.pob).localeCompare(corto(b.pob)) || a.pab.localeCompare(b.pab));
    let horas = ''; for (let h = h0; h < h1; h++) horas += `<span style="left:${(h - h0) * 60 * PX}px">${h}:00</span>`;
    html += `<h2 class="dia-h">${esc(cap(fecha(d, 0, { weekday: 'long', day: 'numeric', month: 'long' })))}</h2>`
      + `<div class="rej-scroll"><div class="rej" style="--w:${(h1 - h0) * 60 * PX}px;--hora:${60 * PX}px;--dur:${DUR * PX}px"><div class="rej-cab"><div class="rej-pab"></div><div class="rej-horas">${horas}</div></div>`;
    for (const f of orden) {
      // Partidos que se solapan en el mismo pabellón (en pistas distintas) van en carriles distintos.
      const fin = [], pos = [];
      for (const m of [...f.ms].sort((a, b) => mins(a) - mins(b))) { let c = fin.findIndex(x => x <= mins(m)); if (c < 0) { c = fin.length; fin.push(0); } fin[c] = mins(m) + DUR; pos.push([m, c]); }
      const pend = f.ms.some(m => !plan[m.key]?.r1);
      html += `<div class="rej-fila" style="--n:${fin.length}"><div class="rej-pab"><b>${esc(pabCorto(f.pab))}</b>${f.pob ? `<small>${esc(corto(f.pob))}</small>` : ''}`
        + `${pend && D.disp.length ? `<button type="button" class="mini" data-franja="${esc(d + '|' + f.k)}" aria-label="${esc(t('franjaT')(pabCorto(f.pab)))}">${esc(t('franjaB'))} →</button>` : ''}</div>`
        + `<div class="rej-pista">${pos.map(([m, c]) => bloque(m, c, plan, h0, arb)).join('')}</div></div>`;
    }
    html += `</div></div>`;
  }
  return html;
}

/* ---------- Ficha de un partido (al tocar un bloque) ---------- */
function abrirFicha(key) { FICHA = key; $('ficha').classList.remove('hidden'); refrescarFicha(PLAN()); $('fichaCerrar').focus(); }
function cerrarFicha() {
  const k = FICHA; FICHA = null; $('ficha').classList.add('hidden');
  const b = [...document.querySelectorAll('[data-ver]')].find(x => x.dataset.key === k); if (b) b.focus();
}
function refrescarFicha(plan) {
  if (!FICHA) return;
  const m = D.partidos.find(x => x.key === FICHA); if (!m) { cerrarFicha(); return; }
  $('fichaIn').innerHTML = tarjeta(m, plan);
}

/* ---------- Barra lateral: árbitros y su carga ---------- */
function cargaDe(a, plan) {
  const ms = D.partidos.filter(m => suyo(m, plan, a.id));
  // La FCVB paga 1 ida y vuelta por pabellón y franja: los km se cuentan así.
  const viajes = new Map(); for (const m of ms) viajes.set(`${dia(m)}|${sinPista(m.pab)}|${franja(m)}`, m);
  const k = [...viajes.values()].reduce((s, m) => s + 2 * (km(a, m) || 0), 0);
  const fr = [['sab', 'manana', 'fSabM'], ['sab', 'tarde', 'fSabT'], ['dom', 'manana', 'fDomM'], ['dom', 'tarde', 'fDomT']].map(([d, f, l]) => {
    const puede = a[d] === 'ambas' || a[d] === f, ocup = ms.some(m => dia(m) === d && franja(m) === f);
    const c = !puede ? 'no' : ocup ? 'ocup' : 'libre';
    return `<i class="${c}" title="${esc(t(c === 'no' ? 'fNo' : c === 'ocup' ? 'fOcup' : 'fLibre'))}">${esc(t(l))}</i>`;
  }).join('');
  return { n: ms.length, km: Math.round(k), fr };
}
function pintarLado(plan) {
  if (!D.disp.length) { $('lado').innerHTML = ''; $('lado').classList.add('hidden'); return; }
  $('lado').classList.remove('hidden');
  const items = D.disp.map(a => { const c = cargaDe(a, plan);
    return `<li><button type="button" class="arb-l" data-resalta="${a.id}" aria-pressed="${RESALTA === a.id}">${chipArb(a)}<span class="nm">${esc(corto(a.nombre))}</span>`
      + `<span class="cg">${esc(t('cargaP')(c.n))}${c.km ? ' · ' + esc(t('cargaKm')(c.km)) : ''}${a.coche ? '' : ' · ' + esc(t('sinCoche'))}</span><span class="fr">${c.fr}</span></button></li>`; });
  $('lado').innerHTML = `<h2 id="ladoT">${esc(t('ladoT'))}</h2>`
    + (RESALTA ? `<button type="button" class="mini" data-resalta="">${esc(t('ladoTodos'))}</button>` : `<p class="small muted">${esc(t('ladoH'))}</p>`)
    + `<ul>${items.join('')}</ul>`;
}

/* ---------- Toda una franja de un pabellón a un árbitro ---------- */
function abrirFranja(d, k) {
  const ms = D.partidos.filter(m => m.d.slice(0, 10) === d && sinPista(m.pab) === k);
  if (!ms.length) return;
  const plan = PLAN(), pend = f => ms.filter(m => franja(m) === f && !plan[m.key]?.r1).length;
  const f0 = pend('manana') >= pend('tarde') ? 'manana' : 'tarde';
  FR = { d, k, ms, f: f0, desde: document.activeElement };
  $('frT').textContent = t('franjaT')(pabCorto(ms[0].pab));
  $('frFranja').innerHTML = ['manana', 'tarde'].map(f => `<label><input type="radio" name="frF" value="${f}"${f === f0 ? ' checked' : ''}><span>${esc(t(f))} (${pend(f)})</span></label>`).join('');
  $('frArb').innerHTML = '';
  pintarFranja(); $('franja').classList.remove('hidden'); $('frArb').focus();
}
function pintarFranja() {
  const plan = PLAN(), pend = FR.ms.filter(m => franja(m) === FR.f && !plan[m.key]?.r1).sort((a, b) => mins(a) - mins(b));
  FR.pend = pend;
  const prev = $('frArb').value, cs = pend[0] ? candidatos(pend[0], plan).filter(c => c.disp) : [];
  $('frArb').innerHTML = cs.map(c => `<option value="${c.a.id}">${esc(corto(c.a.nombre))}${c.k != null ? ' · ' + esc(t('km')(c.k)) : ''}${c.a.coche ? '' : ' · ' + esc(t('sinCoche'))}${c.pisa ? ' · ' + esc(t('yaTiene')(ocTxt(c.ch.o))) : ''}</option>`).join('');
  if (cs.some(c => c.a.id === prev)) $('frArb').value = prev;
  $('frLista').innerHTML = pend.length ? pend.map(m => `<li>${esc(m.d.slice(11, 16))} · ${esc(cat(m.cat))} · ${esc(corto(m.l))} – ${esc(corto(m.v))}</li>`).join('') : `<li>${esc(t('franjaNada'))}</li>`;
  $('frSi').textContent = t('franjaAplicar')(pend.length); $('frSi').disabled = !pend.length || !cs.length;
}
function cerrarFranja() { const de = FR?.desde; FR = null; $('franja').classList.add('hidden'); if (de && de.focus) de.focus(); }
$('fFranja').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('frArb').value, a = ARB()[id], pend = FR?.pend || [];
  if (!a || !pend.length) return;
  // Choques con otros partidos suyos, contando los de esta franja a medida que se le ponen.
  let plan = PLAN(); const choques = [];
  for (const m of pend) { const ch = choque(a, m, plan); if (ch?.tipo === 'pisa') choques.push(`${m.d.slice(11, 16)} → ${ocTxt(ch.o)}`); plan = { ...plan, [m.key]: { ...(plan[m.key] || {}), r1: id } }; }
  let forzar = false;
  if (choques.length) { if (!(await confirmarChoque(t('franjaChoque')(choques.join('\n'))))) return; forzar = true; }
  const items = pend.map(m => ({ key: m.key, rol: 'r1', disp_id: id }));
  cerrarFranja(); await guardarLote(items, forzar);
});
$('frNo').addEventListener('click', cerrarFranja);

async function guardarLote(items, forzar) {
  // Al momento en pantalla; luego, lo que diga el servidor.
  for (const x of items) { D.asig = D.asig.filter(y => !(y.match_key === x.key && y.rol === x.rol)); D.asig.push({ match_key: x.key, rol: x.rol, disp_id: x.disp_id }); }
  pintar();
  const r = await api({ action: 'lote', finde: FINDE, items, forzar });
  await cargar();   // (cargar borra el mensaje: se pone después)
  if (!r.ok) msg(r.error || t('red'), 'err'); else msg(t('propOk')(r.hechos, r.fallos.length), r.fallos.length ? 'err' : 'ok');
}

/* ---------- Propuesta automática ---------- */
// Para cada día, pabellón y franja (la FCVB paga 1 viaje por pabellón y franja), busca a alguien que pueda hacer TODOS
// los partidos sin R1 de ese bloque; si nadie puede, partido a partido. Solo quien está disponible a esa hora, sin
// choques, sin coche solo cerca (12 km), y se prefiere el más cercano y el que menos lleva. Solo R1; nada se guarda
// hasta que el designador pulsa "Guardar la propuesta".
function proponer() {
  PROP = null;
  const plan = PLAN(), p = { ...plan };
  const objetivo = D.partidos.filter(m => m.liga && m.conf && !plan[m.key]?.r1 && m.isquad !== 'con' && (DIA === 'todo' || dia(m) === DIA));
  const bloques = new Map();
  for (const m of objetivo) { const k = `${m.d.slice(0, 10)}|${sinPista(m.pab)}|${franja(m)}`; if (!bloques.has(k)) bloques.set(k, []); bloques.get(k).push(m); }
  const lista = [...bloques.values()].map(b => b.sort((x, y) => mins(x) - mins(y))).sort((a, b) => b.length - a.length || a[0].d.localeCompare(b[0].d));
  const puede = (a, m, q) => disponible(a, m) && (a.coche || (km(a, m) != null && km(a, m) <= 12)) && !Object.values(q[m.key] || {}).includes(a.id) && choque(a, m, q)?.tipo !== 'pisa';
  const coste = (a, ms, q) => ms.reduce((s, m) => s + (km(a, m) ?? 60) + (choque(a, m, q)?.tipo === 'justo' ? 30 : 0), 0) / ms.length + cuantos(a, q) * 8;
  const poner = (a, m) => { p[m.key] = { ...(p[m.key] || {}), r1: a.id }; prop.push({ key: m.key, rol: 'r1', disp_id: a.id }); };
  const prop = []; let sinNadie = 0;
  for (const b of lista) {
    const todos = D.disp.map(a => { let q = p; for (const m of b) { if (!puede(a, m, q)) return null; q = { ...q, [m.key]: { ...(q[m.key] || {}), r1: a.id } }; } return { a, c: coste(a, b, p) }; })
      .filter(Boolean).sort((x, y) => x.c - y.c);
    if (todos.length) { for (const m of b) poner(todos[0].a, m); continue; }
    for (const m of b) {
      const cs = D.disp.filter(a => puede(a, m, p)).map(a => ({ a, c: coste(a, [m], p) })).sort((x, y) => x.c - y.c);
      if (cs.length) poner(cs[0].a, m); else sinNadie++;
    }
  }
  PROP = prop.length ? prop : null; PROP_SIN = sinNadie;
  msg(prop.length ? '' : t('propNada'), prop.length ? '' : 'err');
  pintar();
  if (PROP) $('propSi')?.focus();
}
function pintarProp() {
  if (PROP) PROP = PROP.filter(x => !D.asig.some(y => y.match_key === x.key && y.rol === x.rol));
  if (PROP && !PROP.length) PROP = null;
  $('prop').innerHTML = PROP ? `<div class="msg prop-b"><span>${esc(t('propT')(PROP.length, PROP_SIN))}</span>`
    + `<span class="row"><button type="button" class="primary" id="propSi">${esc(t('propAplicar'))}</button><button type="button" id="propNo">${esc(t('propDescartar'))}</button></span></div>` : '';
}
$('proponer').addEventListener('click', proponer);

/* ---------- Pasado a iSquad ---------- */
async function marcarHecho(key, si) {
  D.hecho = [...HECHO()].filter(k => k !== key).concat(si ? [key] : []);
  pintar();
  const r = await api({ action: 'hecho', finde: FINDE, key, si });
  if (!r.ok) { msg(r.error || t('red'), 'err'); cargar(); }
}

/* ---------- Mensaje de WhatsApp para un árbitro ---------- */
// Se escribe aquí y se abre WhatsApp con el texto (wa.me, sin número: Albert elige el chat). No se envía nada desde la web.
function abrirWa(id) {
  const a = ARB()[id]; if (!a) return;
  const plan = planGuardado(), ms = D.partidos.filter(m => suyo(m, plan, id)).sort((x, y) => x.d.localeCompare(y.d));
  const lin = ms.map(m => {
    const rol = Object.entries(plan[m.key]).find(([, v]) => v === id)[0], dir = m.pista || m.pab;
    return `• ${cap(fecha(m.d.slice(0, 10), 0, { weekday: 'long', day: 'numeric' }))}, ${m.d.slice(11, 16)} · ${t(rol)} · ${cat(m.cat)}\n  ${corto(m.l)} – ${corto(m.v)}\n  ${pabCorto(m.pab)}${pobDe(m) ? ', ' + corto(pobDe(m)) : ''}\n  ${t('waLlegar')}: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir)}`;
  });
  $('waT').textContent = t('waT')(corto(a.nombre));
  $('waTxt').value = ms.length ? [t('waHola')(corto(a.nombre).split(' ')[0]), '', ...lin, '', t('waFin')].join('\n') : t('waNada');
  actualizaWa(); $('wa').dataset.desde = id; $('wa').classList.remove('hidden'); $('waTxt').focus();
}
const actualizaWa = () => { $('waAbrir').href = 'https://wa.me/?text=' + encodeURIComponent($('waTxt').value); };
function cerrarWa() { const id = $('wa').dataset.desde; $('wa').classList.add('hidden'); document.querySelector(`[data-wa="${id}"]`)?.focus(); }
$('waTxt').addEventListener('input', actualizaWa);
$('waNo').addEventListener('click', cerrarWa);
$('waCopiar').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('waTxt').value); msg(t('waCopiado'), 'ok'); } catch (e) { $('waTxt').select(); } });

/* ---------- Mapa ---------- */
const proy = (lon, lat) => { const C = window.CATALUNYA; return [(lon - C.lon0) * C.cx * C.k, (C.lat0 - lat) * C.k]; };
// Ciudades de referencia; las del área de Barcelona (true) solo salen con ese encuadre, si no se montan unas sobre otras.
const CIUDADES = [['Barcelona', 2.17, 41.39], ['Girona', 2.82, 41.98], ['Lleida', 0.62, 41.62], ['Tarragona', 1.25, 41.12], ['Manresa', 1.83, 41.73], ['Vic', 2.25, 41.93],
  ['Tortosa', 0.52, 40.81], ['Figueres', 2.96, 42.27], ['Reus', 1.11, 41.16], ['Igualada', 1.62, 41.58], ['Olot', 2.49, 42.18], ['La Seu d\'Urgell', 1.46, 42.36],
  ['Sabadell', 2.11, 41.55, true], ['Terrassa', 2.01, 41.56, true], ['Mataró', 2.44, 41.54, true], ['Granollers', 2.29, 41.61, true], ['Vilanova i la Geltrú', 1.73, 41.22, true],
  ['Badalona', 2.25, 41.45, true], ["L'Hospitalet", 2.10, 41.36, true], ['Sant Cugat', 2.08, 41.47, true], ['Martorell', 1.93, 41.47, true], ['Vilafranca', 1.70, 41.35, true]];
function mapaHtml(plan, ms) {
  const C = window.CATALUNYA;
  const vb = MAPA_ZONA === 'bcn' ? (() => { const [x0, y0] = proy(1.70, 41.72), [x1, y1] = proy(2.50, 41.22); return [x0, y0, x1 - x0, y1 - y0]; })() : [0, 0, C.w, C.h];
  const z = vb[2] / C.w, arb = ARB();
  const pabs = new Map(), sinUbicar = new Set();
  for (const m of ms) { const k = sinPista(m.pab); if (m.lat == null) { sinUbicar.add(k); continue; } if (!pabs.has(k)) pabs.set(k, { k, pab: m.pab, lat: m.lat, lon: m.lon, ms: [] }); pabs.get(k).ms.push(m); }
  let svg = C.provincias.map(d => `<path class="prov" d="${d}" stroke-width="${1.5 * z}"/>`).join('');
  svg += CIUDADES.filter(c => MAPA_ZONA === 'bcn' || !c[3]).map(([n, lon, lat]) => { const [x, y] = proy(lon, lat); return `<text class="ciu" x="${x + 6 * z}" y="${y - 6 * z}" font-size="${13 * z}">${esc(n)}</text><circle class="ciu-p" cx="${x}" cy="${y}" r="${2 * z}"/>`; }).join('');
  // Líneas de cada árbitro a los pabellones donde tiene partido (con los filtros puestos).
  for (const a of D.disp) {
    if (a.lat == null) continue;
    const [ax, ay] = proy(a.lon, a.lat);
    for (const p of pabs.values()) if (p.ms.some(m => suyo(m, plan, a.id))) {
      const [px, py] = proy(p.lon, p.lat);
      svg += `<line x1="${ax}" y1="${ay}" x2="${px}" y2="${py}" stroke="${colorDe(a)}" stroke-width="${3 * z}" class="${RESALTA && RESALTA !== a.id ? 'tenue' : ''}"/>`;
    }
  }
  const orden = [...pabs.values()].sort((a, b) => b.ms.length - a.ms.length);   // los grandes debajo
  for (const p of orden) {
    const st = p.ms.map(m => estado(m, plan)), e = st.includes('mal') ? 'mal' : st.includes('falta') ? 'falta' : st.every(x => x === 'isq') ? 'isq' : 'ok';
    const [x, y] = proy(p.lon, p.lat), pend = p.ms.filter(m => !plan[m.key]?.r1).length;
    const lbl = `${pabCorto(p.pab)} · ${t('cargaP')(p.ms.length)} · ${pend} ${t('lFalta')}`;
    const cls = `pb ${e}${MAPA_SEL === p.k ? ' sel' : ''}${RESALTA && !p.ms.some(m => suyo(m, plan, RESALTA)) ? ' tenue' : ''}`;
    svg += `<circle class="${cls}" cx="${x}" cy="${y}" r="${(5 + Math.sqrt(p.ms.length) * 3) * z}" stroke-width="${1.5 * z}" data-pab="${esc(p.k)}" tabindex="0" role="button" aria-label="${esc(lbl)}"><title>${esc(lbl)}</title></circle>`;
  }
  for (const a of D.disp) {
    if (a.lat == null) continue;
    const [x, y] = proy(a.lon, a.lat), s = 18 * z;
    svg += `<g class="arb-m${RESALTA && RESALTA !== a.id ? ' tenue' : ''}"><rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" rx="${3 * z}" fill="${colorDe(a)}"/>`
      + `<text x="${x}" y="${y + 3.5 * z}" font-size="${9.5 * z}" text-anchor="middle">${esc(iniciales(a.nombre))}</text><title>${esc(corto(a.nombre))}</title></g>`;
  }
  const sel = MAPA_SEL && pabs.get(MAPA_SEL);
  return `<div class="bar"><div class="opts seg" role="radiogroup" aria-label="Zona">${[['cat', t('mapaCat')], ['bcn', t('mapaBcn')]].map(([v, l]) => `<label><input type="radio" name="zona" value="${v}"${v === MAPA_ZONA ? ' checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>`
    + `<span class="small muted">${esc(t('mapaH'))}${sinUbicar.size ? ' · ' + esc(t('mapaSin')(sinUbicar.size)) : ''}</span></div>`
    + leyenda()
    + `<svg class="mapa" viewBox="${vb.join(' ')}" role="group" aria-label="${esc(t('vMapa'))}">${svg}</svg>`
    + (sel ? `<h2 class="dia-h">${esc(pabCorto(sel.pab))}</h2>` + sel.ms.sort((a, b) => a.d.localeCompare(b.d)).map(m => tarjeta(m, plan)).join('') : '');
}

/* ---------- Eventos ---------- */
document.addEventListener('change', e => {
  const n = e.target.name;
  if (n === 'vista') { VISTA = e.target.value; try { localStorage.setItem('designa-vista', VISTA); } catch (_) {} MAPA_SEL = null; pintar(); return; }
  if (n === 'zona') { MAPA_ZONA = e.target.value; pintar(); return; }
  if (n === 'frF') { FR.f = e.target.value; pintarFranja(); return; }
  if (n === 'finde') { PROP = null; RESALTA = null; MAPA_SEL = null; return; }
  // Si el designador cambia a mano un partido de la propuesta, ese partido sale de la propuesta.
  const s = e.target.closest && e.target.closest('article.m select[data-rol]');
  if (s && PROP) { const k = s.closest('[data-key]').dataset.key; PROP = PROP.filter(x => !(x.key === k && x.rol === s.dataset.rol)); if (!PROP.length) PROP = null; }
}, true);
document.addEventListener('click', e => {
  const el = e.target.closest ? e.target : e.target.parentElement;
  const v = el.closest('[data-ver]'); if (v) { abrirFicha(v.dataset.key); return; }
  const r = el.closest('[data-resalta]'); if (r) { RESALTA = r.dataset.resalta && r.dataset.resalta !== RESALTA ? r.dataset.resalta : null; pintar(); return; }
  const f = el.closest('[data-franja]'); if (f) { const v = f.dataset.franja, i = v.indexOf('|'); abrirFranja(v.slice(0, i), v.slice(i + 1)); return; }
  const w = el.closest('[data-wa]'); if (w) { abrirWa(w.dataset.wa); return; }
  const p = el.closest('[data-pab]'); if (p) { MAPA_SEL = MAPA_SEL === p.dataset.pab ? null : p.dataset.pab; pintar(); return; }
  if (el.id === 'propSi') { const items = PROP.map(x => ({ key: x.key, rol: x.rol, disp_id: x.disp_id })); PROP = null; guardarLote(items, false); return; }
  if (el.id === 'propNo') { PROP = null; pintar(); return; }
  if (el.id === 'fichaCerrar' || e.target === $('ficha')) { cerrarFicha(); return; }
  if (e.target === $('franja')) { cerrarFranja(); return; }
  if (e.target === $('wa')) { cerrarWa(); return; }
});
document.addEventListener('keydown', e => {
  if (!$('aviso').classList.contains('hidden')) return;   // la ventana de choque tiene su propio Escape
  if (e.key === 'Escape') { if (!$('wa').classList.contains('hidden')) cerrarWa(); else if (!$('franja').classList.contains('hidden')) cerrarFranja(); else if (FICHA) cerrarFicha(); return; }
  const p = e.target.closest && e.target.closest('[data-pab]');
  if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); p.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
});
