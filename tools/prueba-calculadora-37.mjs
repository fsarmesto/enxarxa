// Prueba de la calculadora de dietas (issue #37): para varios partidos de verdad (con su fecha real), la calculadora
// rellenada con ese partido tiene que dar exactamente lo mismo que compute(), el cálculo de los cobros.
// Uso, desde la raíz del repo: CHROME=<ruta de Chrome> node tools/prueba-calculadora-37.mjs  (Node 22 o superior)
// Sirve docs/ con un supabase simulado (datos inventados) y conduce Chrome por CDP. Sale con código 1 si algo no cuadra.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DOCS = path.resolve('docs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MOCK = `window.supabase = { createClient(){
  const profile = { user_id:'u-demo', isquad_login:'demo@example.com', nombre:'ARBITRE DE PROVA', origin:'Manresa', rate:'0.26', min_travel:'4', irpf:'2',
    tipo:'arbitro', last_sync:new Date().toISOString(), policy_version:'2026-10-22.2', consent_at:new Date().toISOString() };
  const q = (t) => { const o = { select(){return o}, order(){return o}, eq(){return o}, not(){return o}, gte(){return o}, limit(){return o}, update(){return o}, upsert(){return o},
    range(){ return Promise.resolve({data:[], error:null}) }, single(){ return Promise.resolve({data:t==='profiles'?profile:null, error:null}) },
    then(a,b){ return Promise.resolve({data:[], error:null}).then(a,b) } }; return o; };
  return { from:q, rpc(){ return Promise.resolve({data:null,error:null}) },
    auth:{ getSession(){ return Promise.resolve({data:{session:{access_token:'t',user:{id:'u-demo'}}}}) }, signOut(){ return Promise.resolve({}) } } };
} };`;

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  if (p === '/vendor/supabase-2.45.4.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(MOCK); }
  if (p === '/sw.js') { res.writeHead(404); return res.end(); }
  const f = path.join(DOCS, p);
  if (!f.startsWith(DOCS) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(8125);

const chrome = spawn(process.env.CHROME || 'google-chrome', ['--headless=new', '--no-sandbox', '--remote-debugging-port=9336',
  '--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), 'calc-')), 'about:blank'], { stdio: 'ignore' });
let targets; for (let i = 0; i < 50; i++) { try { targets = await (await fetch('http://127.0.0.1:9336/json')).json(); if (targets.length) break; } catch (e) {} await sleep(200); }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => { const r = await cdp('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r.result?.result?.value ?? { error: r.result?.exceptionDetails?.exception?.description }; };
await cdp('Page.navigate', { url: 'http://localhost:8125/index.html' }); await sleep(3000);

// [caso, fecha real, hora, categoría, equipo arbitral, rol, km de ida]
const CASES = [
  ['lunes 10:00', '2026-10-26', '10:00', 's3', 't3', 'r1', '24'],
  ['viernes 18:00', '2026-10-30', '18:00', 'j1', 't2a', 'r2', '61'],
  ['sábado 15:00', '2026-10-31', '15:00', 'c234', 't1', 'r1', '7'],
  ['domingo 19:00', '2026-11-08', '19:00', 's2', 't2b', 'an', ''],
  ['festivo (lunes 12 oct) 19:00', '2026-10-12', '19:00', 's1', 't3', 'r1', '35'],
  ['Aleví sábado 10:00', '2026-10-24', '10:00', 'alv', 't1', 'r1', '12'],
];
const out = await ev(`(${JSON.stringify(CASES)}).map(([caso,date,time,cat,team,role,km],i)=>{
  const m = {id:'T'+i, date, time, comp:'PRUEBA', phase:'', cat, team, role, holiday:false, no_dieta:null, km_override: km===''?null:+km, tolls:0,
    fcvb_tarifa:null, fcvb_gastos:null, fcvb_pago:null, venue_key:'V'+i, addr:'', teams:'A vs B', venue:'V'};
  MATCHES=[m]; VENUES={}; FKM={};
  const r=compute().res.get(m.id), c=calcResult(calcFrom(m));
  const app={tarifa:r.tariff, dieta:r.dieta, despl:+r.travel.toFixed(2), irpf:r.irpf, total:+r.total.toFixed(2)};
  const calc={tarifa:c.tariff, dieta:c.dieta, despl:+c.travel.toFixed(2), irpf:c.irpf, total:+c.neto.toFixed(2)};
  return {caso, app, calc, ok: JSON.stringify(app)===JSON.stringify(calc)};
})`);
let fallos = 0;
if (!Array.isArray(out)) { console.log('Error en la página:', out); fallos++; }
else for (const r of out) {
  if (!r.ok) fallos++;
  console.log(`${r.ok ? 'OK   ' : 'FALLA'} ${r.caso}: tarifa ${r.app.tarifa} · dieta ${r.app.dieta} · despl. ${r.app.despl} · IRPF ${r.app.irpf} · neto ${r.app.total}${r.ok ? '' : `  (calculadora: ${JSON.stringify(r.calc)})`}`);
}
ws.close(); chrome.kill(); server.close();
console.log(fallos ? `${fallos} casos no cuadran` : 'La calculadora da lo mismo que el cálculo de los cobros en todos los casos.');
process.exit(fallos ? 1 : 0);
