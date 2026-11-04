// Panel del designador: disponibilidad desde y hacia Excel (4-nov-2026, Ferran: Albert puede seguir con su Excel).
// - Plantilla descargable con las columnas que se leen y una hoja de instrucciones.
// - Importar: lee el fichero (xlsx, xls, ods o csv) en el navegador, reconoce las columnas por su título (castellano o
//   catalán, en cualquier orden), enseña la vista previa con lo que se va a crear, actualizar o no se puede leer, y lo
//   manda por tandas a la función designa (acción importar). Nada se guarda hasta pulsar "Importar".
// - Exportar: la disponibilidad del fin de semana con las mismas columnas (se puede volver a importar tal cual).
// Usa lo que define index.html (D, FINDE, t, api, cargar, msg…); se carga después.

const XLSX_URL = '../vendor/xlsx-0.18.5.full.min.js';
async function cargarXlsx() {
  if (window.XLSX) return;
  await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = XLSX_URL; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
}
const sinAcentos = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/* ---------- Columnas ---------- */
// Títulos de la plantilla (los que se escriben al exportar) y cómo se reconocen al importar.
const COLS = [
  { k: 'nombre', es: 'Nombre y apellidos', ca: 'Nom i cognoms', re: /^(nom|nombre|arbitr|àrbitr|cognom|apellid)/ },
  { k: 'poblacion', es: 'Población', ca: 'Població', re: /(poblaci|municipi|localitat|localidad|ciutat|ciudad|residen)/ },
  { k: 'coche', es: 'Coche', ca: 'Cotxe', re: /(coche|cotxe|vehicul|carnet)/ },
  { k: 'sab', es: 'Sábado', ca: 'Dissabte', re: /(sabado|dissabte)|^(sab|dis)\.?$/ },
  { k: 'sab_obs', es: 'Observaciones sábado', ca: 'Observacions dissabte', re: /obs.*(sabado|dissabte|sab|dis)|(sabado|dissabte).*obs/ },
  { k: 'dom', es: 'Domingo', ca: 'Diumenge', re: /(domingo|diumenge)|^(dom|diu)\.?$/ },
  { k: 'dom_obs', es: 'Observaciones domingo', ca: 'Observacions diumenge', re: /obs.*(domingo|diumenge|dom|diu)|(domingo|diumenge).*obs/ },
  { k: 'obs', es: 'Observaciones', ca: 'Observacions', re: /^(obs|observ|comentari|notas?$|nota )/ },
];
function columnas(cab) {
  const idx = {};
  cab.forEach((c, i) => {
    const h = sinAcentos(c); if (!h) return;
    // Las de observaciones de un día primero (si no, "Observaciones sábado" se tomaría por el sábado).
    for (const k of ['sab_obs', 'dom_obs', 'obs', 'nombre', 'poblacion', 'coche', 'sab', 'dom']) {
      if (idx[k] == null && COLS.find(x => x.k === k).re.test(h)) { idx[k] = i; return; }
    }
  });
  return idx;
}

/* ---------- Valores ---------- */
// Sábado/domingo: mañana, tarde, mañana y tarde o no. Admite muchas formas ("Matí", "M", "Tot el dia", "M y T", "x", "Sí"…).
function franjaDe(v) {
  const s = sinAcentos(v).replace(/[.,;:()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s || /^(no|n|-|0|ninguna|cap|res|no puedo|no puc|no disponible|false)$/.test(s)) return 'no';
  const m = /(manana|mati|mat|^m$|^m |\bm\b)/.test(s), t = /(tarde|tarda|^t$|\bt\b)/.test(s);
  if ((m && t) || /(ambas|ambdues|todo|tot|dia sencer|todo el dia|tot el dia|^si$|^s$|^x$|^1$|^true$|^yes$|disponible)/.test(s)) return 'ambas';
  if (m) return 'manana'; if (t) return 'tarde';
  return null;
}
function cocheDe(v) {
  const s = sinAcentos(v);
  if (/^(si|s|yes|y|x|1|true|cotxe|coche|propi|propio)$/.test(s) || /^si\b/.test(s)) return true;
  if (!s || /^(no|n|0|false|-)$/.test(s) || /^no\b/.test(s)) return false;
  return null;
}
const celda = (fila, i) => i == null ? '' : String(fila[i] ?? '').replace(/\s+/g, ' ').trim();

/* ---------- Leer el fichero ---------- */
// Busca en cada hoja una fila de títulos (en las 10 primeras) con al menos nombre y población.
function leerLibro(wb) {
  for (const nom of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1, defval: '', raw: false });
    for (let r = 0; r < Math.min(10, filas.length); r++) {
      const idx = columnas(filas[r]);
      if (idx.nombre != null && idx.poblacion != null) return { hoja: nom, idx, filas: filas.slice(r + 1).map((f, i) => ({ n: r + 2 + i, f })) };
    }
  }
  return null;
}
function interpretar(leido) {
  const { idx } = leido, ya = new Map(D.disp.map(d => [sinAcentos(d.nombre), d]));
  const vistos = new Set(), out = [];
  for (const { n, f } of leido.filas) {
    const nombre = celda(f, idx.nombre), poblacion = celda(f, idx.poblacion);
    if (!nombre && !poblacion && f.every(c => !String(c).trim())) continue;   // fila vacía
    const err = [];
    if (nombre.length < 3) err.push(t('iErrNombre'));
    if (poblacion.length < 2) err.push(t('iErrPob'));
    const coche = idx.coche == null ? null : cocheDe(celda(f, idx.coche));
    if (coche === null) err.push(idx.coche == null ? t('iErrSinCoche') : t('iErrCoche')(celda(f, idx.coche)));
    const sab = idx.sab == null ? null : franjaDe(celda(f, idx.sab)), dom = idx.dom == null ? null : franjaDe(celda(f, idx.dom));
    if (sab === null) err.push(idx.sab == null ? t('iErrSinDia')(t('sabado')) : t('iErrDia')(t('sabado'), celda(f, idx.sab)));
    if (dom === null) err.push(idx.dom == null ? t('iErrSinDia')(t('domingo')) : t('iErrDia')(t('domingo'), celda(f, idx.dom)));
    const obs = celda(f, idx.obs);
    const fila = { fila: n, nombre, poblacion, coche, sab, dom, sab_obs: (celda(f, idx.sab_obs) || obs).slice(0, 300), dom_obs: (celda(f, idx.dom_obs) || obs).slice(0, 300) };
    const k = sinAcentos(nombre);
    if (!err.length && vistos.has(k)) err.push(t('iErrRepe'));
    vistos.add(k);
    const prev = ya.get(k);
    if (!err.length && prev?.app) err.push(t('iErrApp'));
    out.push({ ...fila, err, estado: err.length ? 'error' : prev ? 'actualiza' : 'nueva' });
  }
  return out;
}

/* ---------- Vista previa e importación ---------- */
let IMP = null;
async function abrirFichero(file) {
  try {
    await cargarXlsx();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const leido = leerLibro(wb);
    if (!leido) { msg(t('iSinCols'), 'err'); return; }
    IMP = { nombre: file.name, filas: interpretar(leido), hecho: false };
    pintarImp(); $('imp').classList.remove('hidden'); $('impSi').disabled ? $('impNo').focus() : $('impSi').focus();
  } catch (e) { console.error(e); msg(t('iNoLeo'), 'err'); }
}
function pintarImp(resultado) {
  const ok = IMP.filas.filter(f => f.estado !== 'error'), n = c => IMP.filas.filter(f => f.estado === c).length;
  const fr = v => v === 'no' ? t('noPuede') : t(v);
  $('impT').textContent = t('iTit')(IMP.nombre);
  $('impRes').innerHTML = resultado || `<p>${esc(t('iRes')(n('nueva'), n('actualiza'), n('error')))}</p>`;
  $('impLista').innerHTML = IMP.filas.map(f => `<tr class="${f.estado}"><td>${f.fila}</td><td>${esc(f.nombre)}</td><td>${esc(f.poblacion)}</td>`
    + `<td>${f.coche == null ? '' : esc(f.coche ? t('si') : t('no'))}</td><td>${f.sab ? esc(fr(f.sab)) : ''}</td><td>${f.dom ? esc(fr(f.dom)) : ''}</td>`
    + `<td>${f.estado === 'error' ? `<span class="tag r">${esc(f.err.join(' '))}</span>` : `<span class="tag ${f.estado === 'nueva' ? 'g' : ''}">${esc(t(f.estado === 'nueva' ? 'iNueva' : 'iActualiza'))}</span>`}</td></tr>`).join('');
  $('impSi').textContent = t('iImportar')(ok.length); $('impSi').disabled = IMP.hecho || !ok.length; $('impSi').classList.toggle('hidden', IMP.hecho);
}
async function importarFilas() {
  const filas = IMP.filas.filter(f => f.estado !== 'error').map(({ err, estado, ...r }) => r);
  $('impSi').disabled = true; $('impNo').disabled = true;
  let nuevos = 0, actualizados = 0; const errores = [];
  for (let i = 0; i < filas.length; i += 15) {
    $('impRes').innerHTML = `<p>${esc(t('iImportando')(Math.min(i + 15, filas.length), filas.length))}</p>`;
    const r = await api({ action: 'importar', finde: FINDE, filas: filas.slice(i, i + 15) });
    if (!r.ok) { filas.slice(i, i + 15).forEach(f => errores.push({ fila: f.fila, error: r.error || t('red') })); continue; }
    nuevos += r.nuevos; actualizados += r.actualizados; errores.push(...r.errores);
  }
  IMP.hecho = true; $('impNo').disabled = false;
  for (const e of errores) { const f = IMP.filas.find(x => x.fila === e.fila); if (f) { f.estado = 'error'; f.err = [e.error]; } }
  pintarImp(`<p class="msg ${errores.length ? 'err' : 'ok'}">${esc(t('iHecho')(nuevos, actualizados, errores.length))}</p>`);
  $('impNo').textContent = t('cerrar'); $('impNo').focus();
  await cargar();
}
function cerrarImp() { IMP = null; $('imp').classList.add('hidden'); $('impNo').textContent = t('cancelar'); $('impFile').value = ''; $('bImp').focus(); }

/* ---------- Plantilla y exportar ---------- */
const titulos = () => COLS.filter(c => c.k !== 'obs').map(c => c[LANG] || c.es);
const frTxt = v => v === 'no' ? t('no') : t(v);
function filasDisp() {
  return D.disp.map(a => [corto(a.nombre), a.poblacion, a.coche ? t('si') : t('no'), frTxt(a.sab), a.sab_obs || '', frTxt(a.dom), a.dom_obs || '']);
}
function hojaDisp(filas) {
  const ws = XLSX.utils.aoa_to_sheet([titulos(), ...filas]);
  ws['!cols'] = [{ wch: 28 }, { wch: 20 }, { wch: 8 }, { wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 28 }];
  return ws;
}
async function descargarPlantilla() {
  await cargarXlsx();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hojaDisp([[t('iEj1n'), 'Igualada', t('si'), t('manana'), '', t('ambas'), t('iEj1o')], [t('iEj2n'), 'Sabadell', t('no'), t('tarde'), t('iEj2o'), t('no'), '']]), t('xlsDisp'));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(t('iInstr').map(l => [l])), t('iInstrH'));
  XLSX.writeFile(wb, t('iPlantillaF'));
}
async function exportarDisp() {
  await cargarXlsx();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hojaDisp(filasDisp()), t('xlsDisp'));
  XLSX.writeFile(wb, `${t('iDispF')}-${FINDE}.xlsx`);
}

/* ---------- Eventos ---------- */
$('bImp').addEventListener('click', () => $('impFile').click());
$('impFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) abrirFichero(f); });
$('bPlantilla').addEventListener('click', descargarPlantilla);
$('bExpDisp').addEventListener('click', exportarDisp);
$('impSi').addEventListener('click', importarFilas);
$('impNo').addEventListener('click', cerrarImp);
$('imp').addEventListener('click', e => { if (e.target === $('imp') && !$('impNo').disabled) cerrarImp(); });
$('imp').addEventListener('keydown', e => { if (e.key === 'Escape' && !$('impNo').disabled) cerrarImp(); });
