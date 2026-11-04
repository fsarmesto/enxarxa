// Tablets de árbitros y entrenadores (specs/acta-tablets-alineacion.md, sección 6): 4 "dispositivos" a la vez (pestañas del
// mismo Chrome, que comparten el Supabase simulado): anotador, entrenador local, entrenador visitante y árbitros.
// Uso: node tools/pruebas-navegador/tablets.mjs            (castellano, capturas en OUT)
//      ACTA_CA=1 node tools/pruebas-navegador/tablets.mjs  (catalán: al final, ningún texto sin traducir en las tablets)
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
import { go, ev, click, size, check, resumen, fin, errores, sleep, cdp, shot, pestana } from './base.mjs';
const CA = !!process.env.ACTA_CA, sfx = CA ? '-ca' : '';
const AXE = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const anot = () => cdp('Page.bringToFront');
const acta = () => ev(`(()=>{const id=new URLSearchParams(location.search).get('acta'); return JSON.parse(localStorage.getItem('acta:'+id));})()`);
const rpc = (p, n, b) => p.ev(`window.supabase.createClient('x','y').rpc(${JSON.stringify(n)}, ${JSON.stringify(b)}).then(r => r.data)`);
const axe = async (p, nombre) => {
  await p.ev(AXE);
  const r = await p.ev(`axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice']}, resultTypes:['violations']}).then(r => r.violations.filter(v => ['serious','critical'].includes(v.impact)).map(v => v.id + ': ' + v.nodes.slice(0,2).map(n => n.target.join(' ')).join(' | ')))`);
  check(Array.isArray(r) && !r.length, `axe sin incumplimientos serios (${nombre}) ${JSON.stringify(r).slice(0, 400)}`);
};
const pistaDom = (p) => p.ev(`[...document.querySelectorAll('.campo')].map(c => [...c.querySelectorAll('.jug')].map(j => j.querySelector('.n').textContent + '@' + j.querySelector('.pos').textContent.split(' ')[0]).sort())`);

// ---------- Anotador: partido de prueba con sesión de la app ----------
await size(1280, 800); await go('/acta/', 800); await ev(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('mock-session','1')`); await go('/acta/', 1500);
await click('#prueba'); await sleep(500);
// Modo de la mesa (Ferran): por defecto Manual (un solo dispositivo): nada de tablets.
check(await ev(`document.querySelector('input[name=modo][value=manual]').checked && !document.querySelector('#tablets') && !document.querySelector('.form-espera')`), 'modo Manual por defecto: sin botón Tablets ni avisos de formación');
await shot('tab-anotador-manual' + sfx);
await click('label:has(input[name=modo][value=conexion])'); await sleep(400);
check(await ev(`!!document.querySelector('#tablets')`), 'modo Conexión: botón Tablets en Sorteo y formación inicial');
check(await ev(`(()=>{const id=new URLSearchParams(location.search).get('acta'); return JSON.parse(localStorage.getItem('acta:'+id)).cfg.modo})()`) === 'conexion', 'el modo se guarda en el acta');

// 1. El anotador crea los enlaces; los 3 tokens son distintos; el QR se pinta.
await click('#tablets'); await sleep(400); await click('#crearTab'); await sleep(2000);
let A = await acta(); const T = A.tablets || {};
check(T.arb && T.entL && T.entV && new Set([T.arb, T.entL, T.entV, T.mesa]).size === 4 && [T.arb, T.entL, T.entV].every((t) => /^[a-z0-9]{32}$/.test(t)), '1. 3 enlaces con tokens distintos de 32 caracteres');
check(await ev(`[...document.querySelectorAll('.qr')].filter(q => q.querySelector('img,canvas')).length`) === 3, '1. los 3 códigos QR se pintan');
check(await ev(`JSON.parse(localStorage.getItem('mock-mesa')||'{}')[${JSON.stringify(T.mesa)}]?.estado?.abierta`) === 1, '1. mesa publicada con el set 1 abierto a formaciones');
await shot('tab-anotador-enlaces' + sfx);
await click('#hoja [data-cerrar]'); await sleep(300);
check(await ev(`document.querySelector('#tablets').textContent.includes(${JSON.stringify(CA ? 'Tauletes' : 'Tablets')})`), '1. el botón queda como "● Tablets"');

// 2. Entrenador local antes del set 1: plantilla sin nombres ni líberos; no repite dorsal; envía; reenviar bloqueado.
const EL = await pestana(); await EL.size(1280, 800); await EL.go('/acta/tablet/?t=' + T.entL, 2500);
const dors = await EL.ev(`[...document.querySelectorAll('[data-dorsal]')].map(b => b.dataset.dorsal)`);
check(JSON.stringify(dors) === JSON.stringify(['1', '3', '4', '5', '6', '8', '9', '10', '11', '12', '14']), '2. plantilla del local sin el líbero (7) ' + JSON.stringify(dors));
const txtEL = await EL.ev('document.body.innerText');
check(!/Jordi|Ferran|Puig|Sanch|Armesto|Xavier/.test(txtEL), '2. ningún nombre de jugador ni de entrenador en la tablet');
const estadoRpc = JSON.stringify(await rpc(EL, 'tablet_estado', { tok: T.entL }));
check(!/Jordi|Ferran|Sanch|Marta|Núria|nombre/.test(estadoRpc), '2. ningún nombre en lo que devuelve el servidor');
await EL.shot('tab-entL-vacia' + sfx);
for (const d of ['1', '3', '4']) await EL.click(`[data-dorsal="${d}"]`);
check(await EL.ev(`document.querySelector('[data-dorsal="1"]').disabled`), '2. un dorsal ya colocado queda desactivado');
await EL.click('[data-dorsal="1"]');   // intentar repetirlo
check(await EL.ev(`[...document.querySelectorAll('[data-pos]')].filter(b => b.textContent.startsWith('1') && b.textContent.match(/^1[IV]/)).length`) === 1, '2. el 1 sigue colocado una sola vez');
check(await EL.ev(`document.querySelector('#enviar').disabled`), '2. Enviar desactivado con la formación incompleta');
for (const d of ['5', '6', '8']) await EL.click(`[data-dorsal="${d}"]`);
const formEL = await EL.ev(`[0,1,2,3,4,5].map(i => document.querySelector('[data-pos="'+i+'"] span').textContent)`);
check(JSON.stringify(formEL) === JSON.stringify(['1', '3', '4', '5', '6', '8']), '2. posiciones I..VI en orden de toque ' + JSON.stringify(formEL));
await EL.shot('tab-entL-completa' + sfx);
await EL.click('#enviar'); await sleep(2500);
check(/Enviada a las/i.test(await EL.ev('document.body.innerText')) || CA, '2. "Enviada a las hh:mm"');
check(await EL.ev(`!document.querySelector('#enviar') && !document.querySelector('[data-dorsal]')`), '2. bloqueada: ya no se puede editar ni reenviar');
check((await rpc(EL, 'tablet_enviar_formacion', { tok: T.entL, n: 1, dorsales: ['9', '3', '4', '5', '6', '8'] }))?.error === 'ya enviada', '2. reenviar por la RPC → "ya enviada"');

// 4 (antes de empezar). Entrenador visitante: no recibe la formación del local, ni en pantalla ni en la RPC.
const EV = await pestana(); await EV.size(390, 844); await EV.go('/acta/tablet/?t=' + T.entV, 2500);
const rV = await rpc(EV, 'tablet_estado', { tok: T.entV });
check(rV?.rol === 'entV' && Array.isArray(rV.formaciones) && rV.formaciones.length === 0, '4. la RPC del visitante no trae la formación del local');
check(!JSON.stringify(rV).includes('"1","3","4","5","6","8"'), '4. el estado no contiene la formación del local');
check(await EV.ev(`!document.querySelector('.form6') && document.querySelectorAll('.jug').length === 0`), '4. la pantalla del visitante no enseña la formación del local');
await EV.shot('tab-entV-movil' + sfx);
for (const d of ['3', '4', '5', '6', '8', '10']) await EV.click(`[data-dorsal="${d}"]`);
await EV.click('#enviar'); await sleep(2000);

// Árbitros antes de empezar: ven las formaciones en cuanto llegan (decisión de Ferran).
const AR = await pestana(); await AR.size(1280, 800); await AR.go('/acta/tablet/?t=' + T.arb, 2500);
check(await AR.ev(`document.querySelectorAll('.form6').length`) === 2, 'árbitros: ven las 2 formaciones recibidas antes del set');
check((await rpc(AR, 'tablet_estado', { tok: T.arb }))?.formaciones?.length === 2, 'árbitros: la RPC trae las 2');
await AR.shot('tab-arb-antes' + sfx);

// 3. El anotador ve "Formación recibida", Usar rellena los desplegables, empieza el set: el suceso es igual a lo enviado.
await anot(); await sleep(3500);
check(await ev(`document.querySelectorAll('.form-recib').length`) === 2, '3. "Formación recibida" en los 2 equipos');
await shot('tab-anotador-recibida' + sfx);
await click('[data-usar="L"]'); await click('[data-usar="V"]');
const selL = await ev(`[...document.querySelectorAll('[data-al="L"] select')].sort((a,b)=>a.dataset.pos-b.dataset.pos).map(s=>s.value)`);
check(JSON.stringify(selL) === JSON.stringify(['1', '3', '4', '5', '6', '8']), '3. Usar rellena los desplegables del local ' + JSON.stringify(selL));
check(await ev(`ActaMotor && JSON.parse(localStorage.getItem('acta:'+new URLSearchParams(location.search).get('acta'))).ev.every(e => e.t !== 'inicioSet')`), '3. Usar no empieza el set');
await sleep(2500);
check(/Recibida por el anotador/.test(await EL.ev('document.body.innerText')) || CA, '2. el entrenador ve "Recibida por el anotador"');
await click('label:has(input[name=saca][value=L])'); await click('label:has(input[name=izq][value=L])');
await click('#empezar'); await sleep(1200);
A = await acta();
const alL = A.ev.find((e) => e.t === 'alineacion' && e.eq === 'L'), alV = A.ev.find((e) => e.t === 'alineacion' && e.eq === 'V');
check(JSON.stringify(alL?.jugadores) === JSON.stringify(['1', '3', '4', '5', '6', '8']) && alL.origen === 'tablet', '3. suceso alineacion del local = lo enviado, con origen tablet');
check(JSON.stringify(alV?.jugadores) === JSON.stringify(['3', '4', '5', '6', '8', '10']) && alV.origen === 'tablet', '3. suceso alineacion del visitante = lo enviado');
check((await rpc(EL, 'tablet_estado', { tok: T.entL })).formaciones[0].cerrada === true, '3. la formación queda cerrada en el servidor al empezar el set');

// 4 (después de empezar). El visitante ve las 2 pistas.
await sleep(3000);
check(await EV.ev(`document.querySelectorAll('.campo .jug').length`) === 12, '4. con el set empezado, el visitante ve las 2 pistas (12 jugadores)');

// 5. Árbitros: puntos, sustitución, líbero, tiempo y sanción.
await anot();
for (let i = 0; i < 3; i++) await click('[data-punto="L"]');
await click('[data-punto="V"]');
await click('[data-acc="sust"][data-eq="L"]'); await click('#hojaC [data-sale="1"]'); await click('#hojaC [data-entra="9"]'); await click('#hojaC #ok'); await sleep(300);
// El local recibe (el visitante ganó el último punto): aviso "Líbero 7: ¿entra por…?" → entra por el 8 (zaguero, posición VI).
await click('[data-libent="L|7|8"]'); await sleep(300);
await click('[data-acc="sancion"][data-eq="V"]'); await click('#hojaC [data-tipo="amonestacion"]'); await click('#hojaC [data-quien="10"]'); await click('#hojaC #ok'); await sleep(300);
await click('[data-acc="tiempo"][data-eq="V"]'); await sleep(400);
await ev(`document.querySelector('#hoja:not(.hidden) .card button')?.click()`); await sleep(300);
A = await acta();
const ST = await ev(`(()=>{const id=new URLSearchParams(location.search).get('acta'); const a=JSON.parse(localStorage.getItem('acta:'+id)); const st=ActaMotor.reproducir(a.cfg,a.datos,a.ev); const s=ActaMotor.setActual(st); return {L:ActaMotor.enPista(s,'L'), V:ActaMotor.enPista(s,'V'), lib:s.libero.L, sust:s.nSust.L, t:s.tiempos.V.length, izq:s.izq, pts:s.puntos}})()`);
check(!!ST.lib, '5. el líbero del local (7) ha entrado por el 8 ' + JSON.stringify(ST.lib));
await AR.frente(); await sleep(3000);
const dom = await pistaDom(AR);
const esperado = (eq) => ST[eq].map((n, i) => n + '@' + ['I', 'II', 'III', 'IV', 'V', 'VI'][i]).sort();
const [izqDom, derDom] = dom;
check(JSON.stringify(izqDom) === JSON.stringify(esperado(ST.izq)) && JSON.stringify(derDom) === JSON.stringify(esperado(ST.izq === 'L' ? 'V' : 'L')), '5. rotaciones de los 2 equipos = las del motor ' + JSON.stringify({ dom, ST }));
const arbTxt = await AR.ev('document.body.innerText');
check(await AR.ev(`document.querySelector('.jug.lib') !== null`), '5. el líbero en pista marcado');
check(await AR.ev(`[...document.querySelectorAll('.pan')].map(p => p.dataset.eq + ':' + [...p.querySelectorAll('.fila b')].map(b=>b.textContent).join(',')).sort().join(' ')`) === 'L:0/2,1/6 V:1/2,0/6', '5. contadores: local 1 sustitución, visitante 1 tiempo');
check(await AR.ev(`!!document.querySelector('.pan[data-eq="L"] li b')?.textContent.includes('1 → 9')`), '5. la sustitución 1 → 9 sale en la lista');
check(await AR.ev(`!!document.querySelector('.pan[data-eq="V"] .tarjeta.t-amonestacion')`), '5. la amonestación del visitante sale con su tarjeta');
check(await AR.ev(`!document.querySelector('#crono').classList.contains('hidden') && +document.querySelector('#cronoN').textContent > 20`), '5. cuenta atrás de 30 s del tiempo de descanso');
check(await AR.ev(`document.querySelector('.marc .pts').textContent.replace(/\\s/g,'')`) === `${ST.pts[ST.izq]}–${ST.pts[ST.izq === 'L' ? 'V' : 'L']}`, '5. marcador correcto');
await AR.shot('tab-arb-juego' + sfx);
await AR.size(390, 844); await sleep(600); await AR.shot('tab-arb-juego-movil' + sfx); await AR.size(1280, 800);
await EV.frente(); await sleep(2500); await EV.shot('tab-entV-juego-movil' + sfx);
check(await EV.ev(`!!document.querySelector('.pan[data-eq="V"]') && !document.querySelector('.pan[data-eq="L"]')`), 'entrenador: durante el set ve su panel (no el del rival)');
// "el 9 solo puede volver..." en la tablet del local
await EL.frente(); await sleep(2500);
check(/El 1 solo puede volver por el 9/.test(await EL.ev('document.body.innerText')) || CA, 'entrenador local: "El 1 solo puede volver por el 9"');
await EL.size(1280, 800, true); await sleep(500); await EL.shot('tab-entL-juego-oscuro' + sfx); await EL.size(1280, 800);

// 7. Sin conexión: el anotador no llega al servidor → banda roja en la tablet; el anotador sigue anotando; al volver, se recupera.
await anot(); await ev(`localStorage.setItem('mock-caido','anotador')`);
const nAntes = (await acta()).ev.length;
for (let i = 0; i < 2; i++) await click('[data-punto="V"]');
await sleep(1500);
check((await acta()).ev.length === nAntes + 2, '7. sin conexión el anotador sigue anotando');
check(/sin conexión/i.test(await ev(`document.querySelector('#tablets').textContent`)) || CA, '7. botón "Tablets: sin conexión" ' + await ev(`document.querySelector('#tablets').textContent`));
await AR.frente(); await sleep(17000);
check(await AR.ev(`!document.querySelector('#banda').classList.contains('hidden')`), '7. la tablet enseña la banda "Sin datos del anotador…"');
await AR.shot('tab-arb-sin-datos' + sfx);
await anot(); await ev(`localStorage.removeItem('mock-caido')`); await click('[data-punto="V"]'); await sleep(1500);
check(await ev(`document.querySelector('#tablets').textContent.includes('●')`), '7. al volver la conexión, el botón vuelve a "● Tablets"');
await AR.frente(); await sleep(3000);
check(await AR.ev(`document.querySelector('#banda').classList.contains('hidden')`), '7. la banda desaparece al volver');
await AR.ev(`localStorage.setItem('mock-caido','todo')`); await sleep(3000);
check(/conexi|connexi/i.test(await AR.ev(`document.querySelector('#pie').textContent`)), '7. sin red en la tablet: "Sin conexión: se reintenta…"');
await AR.ev(`localStorage.removeItem('mock-caido')`);

// 6. Entre sets: el entrenador envía la del set 2 (propuesta = la del set 1); el anotador la usa; el set 2 empieza con ella.
await anot();
for (let i = 0; i < 40 && (await ev(`!!document.querySelector('[data-punto="L"]')`)); i++) await click('[data-punto="L"]');
await sleep(1000);
check(await ev(`/set 2/i.test(document.querySelector('#empezar')?.textContent || '')`), '6. fin del set 1: pantalla entre sets');
await EL.frente(); await sleep(3000);
const prop = await EL.ev(`[0,1,2,3,4,5].map(i => document.querySelector('[data-pos="'+i+'"] span')?.textContent)`);
check(JSON.stringify(prop) === JSON.stringify(['1', '3', '4', '5', '6', '8']), '6. propuesta = la formación del set 1 ' + JSON.stringify(prop));
await EL.click('[data-pos="5"]'); await EL.click('[data-k="vaciar"]'); await EL.click('[data-dorsal="12"]');   // cambia el VI: 8 → 12
await EL.click('#enviar'); await sleep(2000);
// 8. Formación no válida: el visitante envía con el 17; el anotador descalifica al 17 → la tarjeta lo dice y no rellena.
await EV.frente(); await sleep(1500);
await EV.click('[data-k="limpiar"]');
for (const d of ['17', '4', '5', '6', '8', '10']) await EV.click(`[data-dorsal="${d}"]`);
await EV.click('#enviar'); await sleep(2000);
await anot();
await click('[data-sanc-entre="V"]'); await click('#hojaC [data-tipo="descalificacion"]'); await click('#hojaC [data-quien="17"]'); await click('#hojaC #ok'); await sleep(3800);
check(await ev(`document.querySelector('[data-formtab="V"] .form-recib.mal') !== null && !document.querySelector('[data-usar="V"]')`), '8. formación no válida: la tarjeta lo dice y no hay Usar');
check(/17/.test(await ev(`document.querySelector('[data-formtab="V"]').textContent`)), '8. con el motivo del motor (el 17)');
await shot('tab-anotador-no-valida' + sfx);
const antesV = await ev(`[...document.querySelectorAll('[data-al="V"] select')].map(s=>s.value).join()`);
check(!antesV.includes('17'), '8. no se ha rellenado con la no válida');
await click('[data-usar="L"]');
await click('#empezar'); await sleep(1200);
A = await acta();
const al2 = A.ev.filter((e) => e.t === 'alineacion' && e.eq === 'L').at(-1);
check(JSON.stringify(al2.jugadores) === JSON.stringify(['1', '3', '4', '5', '6', '12']) && al2.origen === 'tablet', '6. el set 2 empieza con la formación enviada ' + JSON.stringify(al2));
const alV2 = A.ev.filter((e) => e.t === 'alineacion' && e.eq === 'V').at(-1);
check(!alV2.origen, '8. la del visitante (a mano) no lleva origen tablet');

// Tamaño del estado publicado (partido con sucesos de todo tipo): holgado en 20 kB.
const tam = await ev(`JSON.stringify(Object.values(JSON.parse(localStorage.getItem('mock-mesa')))[0].estado).length`);
check(tam < 12000, `estado de mesa: ${tam} bytes (< 20 kB con margen)`);

// 9. 390 px y tablet horizontal, claro y oscuro (capturas) y accesibilidad (axe) de las páginas nuevas.
await EL.size(390, 844); await sleep(500); await EL.shot('tab-entL-juego-movil' + sfx); await axe(EL, 'entrenador, móvil, claro');
await EL.size(1280, 800, true); await sleep(500); await axe(EL, 'entrenador, tablet, oscuro');
await AR.frente(); await AR.size(1280, 800); await sleep(800); await axe(AR, 'árbitros, tablet');
await AR.size(390, 844); await sleep(500); await axe(AR, 'árbitros, móvil');
// Entrenador visitante en el intervalo con el editor (móvil): accesibilidad del editor.
// (El set 2 ya ha empezado: se mira el editor en una pestaña con una mesa nueva de prueba.)
const ED = await pestana(); await ED.size(390, 844); await ED.go('/acta/tablet/?t=nada', 800);
await ED.ev(`(()=>{const m=JSON.parse(localStorage.getItem('mock-mesa')); const x=Object.values(m)[0]; const e=JSON.parse(JSON.stringify(x.estado)); e.fase='entreSets'; e.abierta=6; e.set=6; m.zz={...x, id:'zz', tok_arb:'a'.repeat(32), tok_entl:'l'.repeat(32), tok_entv:'v'.repeat(32), estado:e, updated_at:new Date().toISOString()}; localStorage.setItem('mock-mesa', JSON.stringify(m));})()`);
await ED.go('/acta/tablet/?t=' + 'l'.repeat(32), 2500);
check(await ED.ev(`!!document.querySelector('#enviar')`), '9. editor de formación en el intervalo');
await ED.shot('tab-entL-editor-movil' + sfx); await axe(ED, 'editor de formación, móvil');
await ED.size(1280, 800, true); await sleep(500); await ED.shot('tab-entL-editor-oscuro' + sfx); await axe(ED, 'editor de formación, oscuro');
await ED.go('/acta/tablet/?t=' + 'x'.repeat(32), 2000);
check(/ya no vale|ja no és vàlid|no val/i.test(await ED.ev('document.body.innerText')), 'enlace revocado o falso: "Este enlace ya no vale"');

// 9 (catalán): ningún texto sin traducir en las tablets.
// sinTr también apunta textos YA en catalán (el traductor vuelve a pasar por un nodo que acaba de cambiar) y palabras
// iguales en los 2 idiomas ("Set 1", "Sets"): cuenta como sin traducir solo lo que lleva palabras que solo son castellanas.
const CASTELLANO = /(^|[^\p{L}])(los|las|y|está|hace|desde|todavía|ya|puede|pueden|sin|con|hasta|una vez|enviada a las|recibida|formación|posición|posiciones|sustituci\w*|tiempos?|árbitros?|enlaces?|nuevo|vale|colocado|capitán|quién|solo|otra|mesa|datos|Antes|empieza|Intervalo|Partido|Conectando|Pistas|Usar|Modo|Conexión|Crear|Dejar|Revocar|Escanea|Código|Esperando|Bloqueada|Vaciar|Empezar|Faltan|Dorsales|Enviar|Enviando|elegida)(?=$|[^\p{L}])/iu;
const sinTraducir = (s) => s.filter((t) => CASTELLANO.test(t) && !/^(Equipo [FS]|Partido de prueba)$/.test(t));
if (CA) for (const [n, p] of [['entrenador local', EL], ['entrenador visitante', EV], ['árbitros', AR], ['editor', ED]]) {
  const s = sinTraducir(JSON.parse(await p.ev(`sessionStorage.getItem('sinTr') || '[]'`)));
  check(!s.length, `9. catalán: nada sin traducir (${n}) ${JSON.stringify(s)}`);
}
if (CA) { const s = JSON.parse(await ev(`sessionStorage.getItem('sinTr') || '[]'`)); const mios = sinTraducir(s).filter((t) => /tablet|formaci|enlace|compartir|entrenador|QR|Usar|Revocar|modo|conexi|manual/i.test(t)); check(!mios.length, '9. catalán: textos nuevos del anotador traducidos ' + JSON.stringify(mios)); }

// Pasar a Manual con el partido en marcha no se puede desde el juego; se prueba en Datos de un acta nueva: Conexión → Manual
// con enlaces activos pide confirmar, deja de compartir y el enlace deja de valer.
await anot(); await go('/acta/', 1200); await click('#prueba'); await sleep(500);
await click('label:has(input[name=modo][value=conexion])'); await sleep(300);
await click('#tablets'); await sleep(400); await click('#crearTab'); await sleep(1500); await click('#hoja [data-cerrar]'); await sleep(300);
const T2 = (await acta()).tablets;
await click('label:has(input[name=modo][value=manual])'); await sleep(1200);
check(!(await acta()).tablets && !(await ev(`!!document.querySelector('#tablets')`)), 'Conexión → Manual: deja de compartir y desaparece el botón');
check((await rpc(EL, 'tablet_estado', { tok: T2.entL })) === null, 'Conexión → Manual: el enlace ya no vale');

// 10. Ningún error de JavaScript en ninguna página.
const errs = [...errores(), ...EL.errores(), ...EV.errores(), ...AR.errores(), ...ED.errores()];
check(!errs.length, '10. sin errores de JavaScript ' + JSON.stringify(errs.slice(0, 3)));
await fin(); process.exit(resumen() ? 1 : 0);
