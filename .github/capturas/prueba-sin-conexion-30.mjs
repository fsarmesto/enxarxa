// Prueba local (CHROME=<ruta de Chrome> si no es google-chrome): sirve docs/ con un supabase simulado (datos inventados) y conduce Chrome por CDP.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const DOCS = path.resolve('docs');
const OUT = path.resolve('.github/capturas/30');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MOCK = `
window.supabase = { createClient(){
  const online = () => navigator.onLine;
  // Cobertura débil simulada: con liq-mock-lento, cada consulta tarda 14 s.
  const wait = r => localStorage.getItem('liq-mock-lento') ? new Promise(ok=>setTimeout(()=>ok(r),14000)) : Promise.resolve(r);
  const fail = { data:null, error:{ message:'TypeError: Failed to fetch' } };
  const M = (d,n,t,h,comp,teams,venue,addr,role) => ({ id:'DEMO'+n, comp, phase:'', teams, estado:'', date:d, time:t, venue, addr, venue_key:venue.toLowerCase(), cat:null, team:'t1', role,
    tolls:0, holiday:false, no_dieta:null, paid:false, not_received:false, km_override:null, dieta_override:null, fcvb_tarifa:null, fcvb_gastos:null, fcvb_pago:null, fcvb_limite:null, fcvb_accion:null, crew:[{f:'r1',n:'ÁRBITRO DEMO',me:true},{f:'r2',n:'COMPAÑERO DEMO'}] });
  const d=(n)=>{ const x=new Date(); x.setDate(x.getDate()+n); return x.toISOString().slice(0,10); };
  const matches=[ M(d(1),1,'18:00',0,'PRIMERA DIVISION SENIOR MASCULINO','CV DEMO A - CV DEMO B','PAVELLO DEMO NORD','CARRER DEMO 1, 08001 BARCELONA','r1'),
    M(d(5),2,'12:00',0,'SEGONA DIVISIO SENIOR FEMENINO','CV EXEMPLE - CV PROVA','PAVELLO DEMO SUD','CARRER EXEMPLE 7, 08201 SABADELL','r2'),
    M(d(-3),3,'17:00',0,'CADET MASCULI','CV PROVA - CV DEMO C','PAVELLO DEMO NORD','CARRER DEMO 1, 08001 BARCELONA','r1') ];
  const venues=[{venue_key:'pavello demo nord',label:'PAVELLÓ DEMO NORD',km:12,km_source:'manual'},{venue_key:'pavello demo sud',label:'PAVELLÓ DEMO SUD',km:30,km_source:'manual'}];
  const profile={ user_id:'u-demo', isquad_login:'demo@example.com', nombre:'ÁRBITRO DEMO', origin:'Barcelona', rate:'0.26', min_travel:'4', irpf:'2', tipo:'arbitro', last_sync:new Date().toISOString(), last_error:null, policy_version:'2026-10-22.2', consent_at:new Date().toISOString(), cal_token:'x' };
  const q = (table) => { const o={ select(){return o}, order(){return o}, eq(){return o}, in(){return o}, update(){return o}, upsert(){return o}, insert(){return o}, delete(){return o}, filter(){return o},
    range(){ return wait(online() ? {data: table==='matches'?matches:[], error:null} : fail) },
    single(){ return wait(online() ? {data: table==='profiles'?profile:null, error:null} : fail) },
    then(a,b){ return wait(online() ? {data: table==='venues'?venues:[], error:null} : fail).then(a,b) } }; return o; };
  return { from:q, rpc(){ return Promise.resolve({data:null,error:null}) },
    auth:{ getSession(){ return Promise.resolve({data:{session:{access_token:'t',user:{id:'u-demo'}}}}) }, signOut(){ return Promise.resolve({}) }, verifyOtp(){ return Promise.resolve({}) } } };
} };`;

let server, SLOW = 0;
const mk = () => new Promise(ok => {
  server = http.createServer(async (req, res) => {
    if (SLOW) await sleep(SLOW);
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    if (p === '/vendor/supabase-2.45.4.js') { res.writeHead(200, {'Content-Type':'text/javascript'}); return res.end(MOCK); }
    const f = path.join(DOCS, p);
    if (!f.startsWith(DOCS) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
    const ext = path.extname(f);
    const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
    res.writeHead(200, {'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control':'no-cache'}); fs.createReadStream(f).pipe(res);
  }).listen(8123, ok);
});
await mk();

const chrome = spawn(process.env.CHROME || 'google-chrome', ['--headless=new','--no-sandbox','--remote-debugging-port=9333','--user-data-dir='+fs.mkdtempSync(path.join(os.tmpdir(),'enx-')),'--window-size=900,1200','about:blank'], {stdio:'ignore'});
let targets; for (let i=0;i<50;i++){ try{ targets = await (await fetch('http://127.0.0.1:9333/json')).json(); if(targets.length) break; }catch(e){} await sleep(200); }
const page = targets.find(t => t.type==='page');
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method==='Runtime.consoleAPICalled' || m.method==='Runtime.exceptionThrown') logs.push(JSON.stringify(m.params).slice(0,300)); };
const cdp = (method, params={}) => new Promise(r => { const i=++id; pend.set(i, r); ws.send(JSON.stringify({id:i, method, params})); });
const ev = async expr => (await cdp('Runtime.evaluate', {expression:expr, returnByValue:true, awaitPromise:true})).result?.result?.value;
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', {width:390, height:844, deviceScaleFactor:2, mobile:true});
await cdp('Emulation.setTouchEmulationEnabled', {enabled:true});
const shot = async name => { const r = await cdp('Page.captureScreenshot', {format:'png'}); fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64')); };
const go = async url => { await cdp('Page.navigate', {url}); await sleep(2500); };
const scheme = async dark => cdp('Emulation.setEmulatedMedia', {features:[{name:'prefers-color-scheme', value: dark?'dark':'light'}]});

const URL0 = 'http://localhost:8123/index.html';
await scheme(false);
await go(URL0);
// Cada comprobación se imprime; si alguna falla, el script sale con código 1 (lo usan las pruebas automáticas).
const fallos = [];
const check = (nombre, ok, detalle = '') => { console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}${detalle !== '' ? ': ' + detalle : ''}`); if (!ok) fallos.push(nombre); };
await ev(`localStorage.setItem('liq-guia-vista','1')`);
await go(URL0);                       // 1ª carga con red: guarda la copia y el service worker cachea la app
await sleep(1500);
check('service worker activo', await ev(`navigator.serviceWorker.getRegistration().then(r=>!!(r&&r.active))`) === true);
const cach = await ev(`caches.keys().then(async ks=>{const c=await caches.open(ks[0]);return (await c.keys()).length})`);
check('app en caché', cach >= 15, `${cach} ficheros`);
const copia = await ev(`new Promise(ok=>{const r=indexedDB.open('enxarxa-offline');r.onsuccess=()=>{const g=r.result.transaction('kv').objectStore('kv').getAllKeys();g.onsuccess=()=>ok(g.result.join())}})`);
check('copia local guardada', /snap:u-demo/.test(copia || ''), copia);
check('con red, sin barra de sin conexión', await ev(`document.getElementById('offBar').classList.contains('hidden')`) === true);
await shot('online-claro.png');
await scheme(true); await sleep(300); await shot('online-oscuro.png');

// Sin red de verdad: se apaga el servidor y se emula "modo avión" (navigator.onLine = false).
server.closeAllConnections(); await new Promise(r => server.close(r));
await cdp('Network.enable'); await cdp('Network.emulateNetworkConditions', {offline:true, latency:0, downloadThroughput:0, uploadThroughput:0});
await scheme(false);
await go(URL0);
const barra = await ev(`document.getElementById('offBar').textContent`);
check('modo avión: barra "Sin conexión · datos del …"', /^Sin conexión · datos del /.test(barra || '') && await ev(`!document.getElementById('offBar').classList.contains('hidden')`), barra);
check('modo avión: la app abre con los partidos', await ev(`!document.getElementById('appView').classList.contains('hidden') && /DEMO NORD/i.test(document.body.innerText)`) === true);
await shot('offline-claro.png');
await ev(`document.getElementById('btnSync').click()`); await sleep(300);
const t1 = await ev(`document.getElementById('toast').textContent`);
check('modo avión: "Actualizar" avisa', /Sin conexión/.test(t1 || ''), t1);
await shot('offline-actualizar-claro.png');
await ev(`document.querySelector('[data-view="agenda"]').click()`); await sleep(3500);
await scheme(true); await sleep(400); await shot('offline-oscuro.png');
await ev(`localStorage.setItem('liq-lang','ca')`); await go(URL0); await scheme(false); await sleep(300);
const bca = await ev(`document.getElementById('offBar').textContent`);
check('modo avión en catalán', /^Sense connexió · dades del /.test(bca || ''), bca);
await shot('offline-catalan-claro.png');
// Cobertura débil: hay red pero todo tarda. La página sale de la caché a los 4 s y la copia local a los 8 s; al acabar
// la carga, los datos nuevos y "Conexión recuperada".
await ev(`localStorage.setItem('liq-lang','es')`);
await cdp('Network.emulateNetworkConditions', {offline:false, latency:0, downloadThroughput:-1, uploadThroughput:-1});
SLOW = 20000; await mk();
await ev(`localStorage.setItem('liq-mock-lento','1')`);
cdp('Page.navigate', {url: URL0});
await sleep(6000);
check('cobertura débil: la página sale de la caché antes de 6 s', await ev(`!!document.getElementById('offBar')`) === true);
await sleep(7000);
check('cobertura débil: a los 13 s, la copia local con la barra', await ev(`!document.getElementById('appView').classList.contains('hidden') && !document.getElementById('offBar').classList.contains('hidden')`) === true);
await shot('debil-claro.png');
await sleep(12000);
check('cobertura débil: al llegar los datos, sin barra y "Conexión recuperada"', await ev(`document.getElementById('offBar').classList.contains('hidden') && /Conexión recuperada/.test(document.getElementById('toast').textContent)`) === true);
await ev(`localStorage.removeItem('liq-mock-lento')`);
const errs = logs.filter(l=>/exception/i.test(l));
check('sin errores de JavaScript', !errs.length, errs.slice(0, 3).join(' | '));
ws.close(); chrome.kill();
console.log(fallos.length ? `${fallos.length} comprobaciones fallan` : 'Todo bien.');
process.exit(fallos.length ? 1 : 0);
