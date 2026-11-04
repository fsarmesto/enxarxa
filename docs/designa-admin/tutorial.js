// Panel del designador: tutorial paso a paso (4-nov-2026). Cada paso señala una parte de la página y explica para qué
// sirve. Se abre solo la primera vez y cada vez que sube TOUR_VERSION; luego, con el botón "Cómo funciona".
//
// REGLA (Ferran, 4-nov-2026): cada vez que se cambie el panel hay que repasar estos pasos para que sigan teniendo sentido
// y, si el cambio es visible para Albert, subir TOUR_VERSION (le vuelve a salir con lo nuevo). La prueba visual.mjs
// recorre todos los pasos y falla si alguno apunta a algo que ya no existe.

const TOUR_VERSION = 3;   // 2 (4-nov-2026): sin el paso de WhatsApp; la disponibilidad, por formulario o correo. 3: vista Por pabellón
// sel: lo que se señala (sin sel = ventana centrada). tab/vista: dónde tiene que estar la página para verlo.
const PASOS = [
  { id: 'hola' },
  { id: 'finde', sel: '#findes', tab: 'part' },
  { id: 'disp', sel: '#impBar', tab: 'arb' },
  { id: 'progreso', sel: '#kpis', tab: 'part' },
  { id: 'vistas', sel: '#vistas', tab: 'part' },
  { id: 'pab', sel: '#vistas label:nth-child(2)', tab: 'part' },
  { id: 'colores', sel: '.leyenda', tab: 'part', vista: 'rejilla' },
  { id: 'bloque', sel: '.blq', tab: 'part', vista: 'rejilla' },
  { id: 'choques' },
  { id: 'lado', sel: '#lado', tab: 'part' },
  { id: 'franja', sel: '[data-franja]', tab: 'part', vista: 'rejilla' },
  { id: 'proponer', sel: '#proponer', tab: 'part' },
  { id: 'mapa', sel: '#vistas label:nth-child(4)', tab: 'part' },
  { id: 'excel', sel: '#exportar', tab: 'part' },
  { id: 'fin', sel: '#ayuda' },
];
const TOUR_TXT = {
  es: {
    hola: ['Cómo funciona', 'Este panel te ayuda a repartir los partidos del fin de semana. Es solo tu plan: no cambia nada en iSquad ni avisa a nadie. En 1 minuto te enseño cada parte.'],
    finde: ['Fin de semana', 'Elige si preparas este fin de semana o el siguiente.'],
    disp: ['Primero, quién puede', 'La disponibilidad entra de 3 maneras: los árbitros la dan con el enlace del formulario, la importas de tu propio Excel (descarga la plantilla para ver las columnas) o la añades a mano si te la mandan por correo. También la puedes exportar.'],
    progreso: ['Cómo vas', 'Cuántos partidos tienen ya R1 el sábado y el domingo, y cuántos has pasado ya a iSquad.'],
    vistas: ['4 maneras de verlo', 'Cuadrícula: pabellones y horas de un vistazo. Por pabellón: designas pabellón a pabellón. Lista: partido a partido. Mapa: dónde está cada pabellón y cada árbitro.'],
    pab: ['Por pabellón', 'Abre un pabellón y verás sus partidos por día y franja. En cada franja te salen los árbitros que pueden hacerla entera, del más cercano al más lejano: un clic y queda puesto de R1 en todos. Debajo puedes afinar partido a partido.'],
    colores: ['Los colores', 'Verde: tiene R1. Amarillo: le falta. Rojo: alguien está en 2 partidos a la vez. Gris: iSquad ya tiene árbitro. Discontinuo: propuesta sin guardar. ✓: ya pasado a iSquad.'],
    bloque: ['Cada partido', 'Tócalo para elegir R1, R2 y anotador. Debajo salen los recomendados (disponibles, cerca y sin otro partido) y la casilla "Pasado a iSquad". Los km se cuentan desde donde estará: si ese día ya tiene otro partido a menos de 4 h, desde ese pabellón; si no, desde casa.'],
    choques: ['Si alguien ya tiene partido', 'Si eliges a alguien que ya tiene un partido a esa hora o que no llegaría (en otro pabellón cuento 2 h de partido, el viaje y llegar 30 min antes; en el mismo, 1 h 30), te aviso antes de guardarlo. Tú decides. A esa gente no te la recomiendo.'],
    lado: ['Tus árbitros', 'Cada uno tiene su color. Ves cuántos partidos lleva, los km aproximados y qué franjas tiene libres. Toca uno para resaltar sus partidos.'],
    franja: ['Toda una franja de golpe', 'Pon a un árbitro de R1 en todos los partidos sin R1 de la mañana o la tarde de un pabellón. Así hace un solo viaje.'],
    proponer: ['Que te lo proponga', 'Rellena los R1 que faltan con quien está disponible, más cerca y sin choques, intentando que cada uno haga la franja entera en el mismo pabellón. Lo revisas y lo guardas o lo descartas.'],
    mapa: ['El mapa', 'Círculos: pabellones (el color dice cómo están). Cuadrados: árbitros. Las líneas unen a cada árbitro con sus partidos.'],
    excel: ['Excel', 'Descarga el plan (y la disponibilidad, en otra hoja). Cuando lo pases a iSquad, marca la casilla de cada partido para no perderte.'],
    fin: ['Ya está', 'Puedes volver a ver este tutorial cuando quieras desde aquí.'],
    sig: 'Siguiente', ant: 'Anterior', salir: 'Salir', fin2: 'Empezar', paso: (a, b) => `Paso ${a} de ${b}`,
  },
  ca: {
    hola: ['Com funciona', 'Aquest panell t\'ajuda a repartir els partits del cap de setmana. És només el teu pla: no canvia res a iSquad ni avisa ningú. En 1 minut t\'ensenyo cada part.'],
    finde: ['Cap de setmana', 'Tria si prepares aquest cap de setmana o el següent.'],
    disp: ['Primer, qui pot', 'La disponibilitat entra de 3 maneres: els àrbitres la donen amb l\'enllaç del formulari, la importes del teu propi Excel (descarrega la plantilla per veure les columnes) o l\'afegeixes a mà si te l\'envien per correu. També la pots exportar.'],
    progreso: ['Com vas', 'Quants partits ja tenen R1 dissabte i diumenge, i quants n\'has passat ja a iSquad.'],
    vistas: ['4 maneres de veure-ho', 'Graella: pavellons i hores d\'un cop d\'ull. Per pavelló: designes pavelló a pavelló. Llista: partit a partit. Mapa: on és cada pavelló i cada àrbitre.'],
    pab: ['Per pavelló', 'Obre un pavelló i veuràs els seus partits per dia i franja. A cada franja et surten els àrbitres que poden fer-la sencera, del més proper al més llunyà: un clic i queda posat de R1 a tots. A sota pots afinar partit a partit.'],
    colores: ['Els colors', 'Verd: té R1. Groc: li falta. Vermell: algú és a 2 partits alhora. Gris: iSquad ja té àrbitre. Discontinu: proposta sense desar. ✓: ja passat a iSquad.'],
    bloque: ['Cada partit', 'Toca\'l per triar R1, R2 i anotador. A sota surten els recomanats (disponibles, a prop i sense cap altre partit) i la casella "Passat a iSquad". Els km es compten des d\'on serà: si aquell dia ja té un altre partit a menys de 4 h, des d\'aquell pavelló; si no, des de casa.'],
    choques: ['Si algú ja té partit', 'Si tries algú que ja té un partit a aquella hora o que no hi arribaria (en un altre pavelló compto 2 h de partit, el viatge i arribar 30 min abans; al mateix, 1 h 30), t\'aviso abans de desar-ho. Tu decideixes. Aquesta gent no te la recomano.'],
    lado: ['Els teus àrbitres', 'Cadascun té el seu color. Veus quants partits porta, els km aproximats i quines franges té lliures. Toca\'n un per ressaltar els seus partits.'],
    franja: ['Tota una franja de cop', 'Posa un àrbitre de R1 a tots els partits sense R1 del matí o de la tarda d\'un pavelló. Així fa un sol viatge.'],
    proponer: ['Que t\'ho proposi', 'Omple els R1 que falten amb qui està disponible, més a prop i sense xocs, intentant que cadascú faci la franja sencera al mateix pavelló. La revises i la deses o la descartes.'],
    mapa: ['El mapa', 'Cercles: pavellons (el color diu com estan). Quadrats: àrbitres. Les línies uneixen cada àrbitre amb els seus partits.'],
    excel: ['Excel', 'Descarrega el pla (i la disponibilitat, en un altre full). Quan el passis a iSquad, marca la casella de cada partit per no perdre\'t.'],
    fin: ['Ja està', 'Pots tornar a veure aquest tutorial quan vulguis des d\'aquí.'],
    sig: 'Següent', ant: 'Anterior', salir: 'Surt', fin2: 'Comença', paso: (a, b) => `Pas ${a} de ${b}`,
  },
};
const tt = k => (TOUR_TXT[LANG] || TOUR_TXT.es)[k];
let PASO = -1, FOCO = null;

function irA(p) {
  if (p.tab && TAB !== p.tab) { TAB = p.tab; $('tPart').setAttribute('aria-selected', String(TAB === 'part')); $('tArb').setAttribute('aria-selected', String(TAB === 'arb')); pintar(); }
  if (p.vista && VISTA !== p.vista) { VISTA = p.vista; pintar(); }
}
function pintarPaso() {
  const p = PASOS[PASO], [tit, txt] = tt(p.id), ult = PASO === PASOS.length - 1;
  if (D) irA(p);
  FOCO?.classList.remove('tour-foco'); FOCO = null;
  const el = p.sel ? [...document.querySelectorAll(p.sel)].find(x => x.getClientRects().length) : null;
  const box = $('tour');
  $('tourT').textContent = tit; $('tourX').textContent = txt; $('tourN').textContent = tt('paso')(PASO + 1, PASOS.length);
  $('tourAnt').textContent = tt('ant'); $('tourAnt').classList.toggle('hidden', PASO === 0); $('tourSig').textContent = ult ? tt('fin2') : tt('sig'); $('tourSalir').textContent = tt('salir');
  $('tourSalir').classList.toggle('hidden', ult);
  box.classList.remove('hidden'); box.classList.toggle('centro', !el);
  if (el) {
    FOCO = el; el.classList.add('tour-foco'); el.scrollIntoView({ block: 'center', behavior: 'instant' });
    // Hueco fijo encima de lo señalado (la sombra en el propio elemento queda recortada dentro de la cuadrícula).
    const r = el.getBoundingClientRect(), hu = $('tourHueco'), W = document.documentElement.clientWidth, H = innerHeight;
    Object.assign(hu.style, { top: `${r.top - 6}px`, left: `${r.left - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` }); hu.classList.remove('hidden');
    // La ventanita, debajo de lo señalado (o encima si no cabe), dentro de la pantalla.
    const h = box.offsetHeight, w = box.offsetWidth;
    const top = r.bottom + 14 + h < H ? r.bottom + 14 : Math.max(8, r.top - 14 - h);
    box.style.top = `${top}px`; box.style.left = `${Math.min(Math.max(8, r.left), W - w - 8)}px`;
  } else { box.style.top = ''; box.style.left = ''; $('tourHueco').classList.add('hidden'); }
  $('tourSig').focus();
}
function abrirTour() { PASO = 0; pintarPaso(); }
function cerrarTour() {
  FOCO?.classList.remove('tour-foco'); FOCO = null; PASO = -1; $('tour').classList.add('hidden'); $('tourHueco').classList.add('hidden');
  try { localStorage.setItem('designa-tour', String(TOUR_VERSION)); } catch (e) {}
  if (D) { TAB = 'part'; $('tPart').setAttribute('aria-selected', 'true'); $('tArb').setAttribute('aria-selected', 'false'); pintar(); }
  $('ayuda').focus();
}
// La primera vez (o con novedades), al cargar el panel.
function tourAuto() {
  let visto = 0; try { visto = +(localStorage.getItem('designa-tour') || 0); } catch (e) { visto = TOUR_VERSION; }
  if (visto < TOUR_VERSION && PASO < 0) abrirTour();
}

$('ayuda').addEventListener('click', abrirTour);
$('tourSig').addEventListener('click', () => { if (PASO >= PASOS.length - 1) cerrarTour(); else { PASO++; pintarPaso(); } });
$('tourAnt').addEventListener('click', () => { if (PASO > 0) { PASO--; pintarPaso(); } });
$('tourSalir').addEventListener('click', cerrarTour);
$('tour').addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); cerrarTour(); } });
addEventListener('resize', () => { if (PASO >= 0) pintarPaso(); });
