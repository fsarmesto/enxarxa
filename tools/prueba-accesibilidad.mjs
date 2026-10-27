// Auditoría de accesibilidad con axe-core (WCAG 2.0/2.1/2.2 AA y buenas prácticas) en todas las vistas, claro y oscuro,
// a 390 px (móvil) y 1280 px (escritorio), con un supabase simulado y datos inventados. Sale con código 1 si hay algún
// incumplimiento serio o crítico (contraste, nombres de botones, etiquetas...).
// Uso, desde la raíz del repo: npm i --no-save axe-core@4.10.2 && CHROME=<ruta de Chrome> node tools/prueba-accesibilidad.mjs
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const DOCS = path.resolve('docs');
const AXE = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MOCK = `(() => {
  const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const M = (n, date, time, comp, teams, venue, addr, role, extra) => ({ id: 'DEMO' + n, comp, phase: '', teams, estado: 'PENDIENTE', date, time, venue, addr,
    venue_key: venue, cat: null, team: 't2a', role, tolls: 0, holiday: false, no_dieta: null, paid: false, not_received: false, km_override: null,
    dieta_override: null, fcvb_tarifa: null, fcvb_gastos: null, fcvb_pago: null, fcvb_limite: null, fcvb_accion: null, staff_checked: d(-30),
    crew: [{ f: 'r1', n: 'ARBITRE DE PROVA', me: role === 'r1' }, { f: 'r2', n: 'PERSONA INVENTADA', me: role === 'r2' }], id_partido: '7000' + n, ...extra });
  const matches = [
    M(1, d(2), '18:00', 'TERCERA DIVISION SENIOR MASCULINO', 'CV EXEMPLE vs CLUB PROVA', 'PAVELLO DE PROVA', 'C. PROVA 1, 08240 MANRESA', 'r1', {}),
    M(2, d(-2), '12:00', 'SEGUNDA DIVISION JUVENIL FEMENINO', 'CE MOSTRA vs CV INVENTAT', 'PAVELLO DE MOSTRA', 'C. MOSTRA 5, 08700 IGUALADA', 'r1', {}),
    M(3, d(-9), '17:00', 'PRIMERA DIVISION SENIOR FEMENINO', 'CV PROVA vs CE MOSTRA', 'PAVELLO DE PROVA', 'C. PROVA 1, 08240 MANRESA', 'r2',
      { estado: 'FINALIZADO', res_l: 3, res_v: 1, acta_url: 'https://voleibol.isquad.es/uploads/actas/0/0.pdf', fcvb_tarifa: '25.93', fcvb_gastos: '12.48', fcvb_pago: 'PAGADO - 01/01/2026', fcvb_accion: 'factura' })];
  const venues = [{ venue_key: 'PAVELLO DE PROVA', label: null, km: 12, km_source: 'ruta', min: 14 }, { venue_key: 'PAVELLO DE MOSTRA', label: null, km: 31, km_source: 'ruta', min: 28 }];
  const profile = { user_id: 'u-demo', isquad_login: 'demo@example.com', nombre: 'ARBITRE DE PROVA', origin: 'Manresa', rate: '0.26', min_travel: '4', irpf: '2',
    tipo: 'arbitro', last_sync: new Date().toISOString(), policy_version: '2026-10-22.2', consent_at: new Date().toISOString(), lang: 'es' };
  const avisos = [{ key: 'nueva:DEMO1', sent_at: new Date().toISOString(), msg: { title: 'Nueva designación', body: 'Cv Exemple – Club Prova', tag: 'desig-DEMO1', url: './?vista=agenda' } }];
  const data = t => t === 'matches' ? matches : t === 'venues' ? venues : t === 'push_log' ? avisos : [];
  const q = t => { const o = { select() { return o }, order() { return o }, eq() { return o }, not() { return o }, gte() { return o }, limit() { return o }, update() { return o }, upsert() { return o },
    range(a, b) { return Promise.resolve({ data: data(t).slice(a, b + 1), error: null }) }, single() { return Promise.resolve({ data: t === 'profiles' ? profile : null, error: null }) },
    then(a, b) { return Promise.resolve({ data: data(t), error: null }).then(a, b) } }; return o; };
  window.supabase = { createClient() { return { from: q, rpc: async () => ({ data: null, error: null }),
    auth: { getSession: async () => ({ data: { session: { access_token: 't', user: { id: 'u-demo' } } } }), signOut: async () => ({}) } }; } };
  const f = window.fetch; window.fetch = (u, o) => /functions\\/v1\\//.test(String(u)) ? Promise.resolve(new Response(JSON.stringify({ ok: true, favs: [], partidos: [], sugerencias: {} }), { status: 200 })) : f(u, o);
  try { localStorage.setItem('liq-guia-vista', '1'); localStorage.setItem('liq-push-ahora-no', '1'); } catch (e) {}
})();`;

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  if (p === '/vendor/supabase-2.45.4.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(MOCK); }
  if (p === '/sw.js') { res.writeHead(404); return res.end(); }
  const f = path.join(DOCS, p);
  if (!f.startsWith(DOCS) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(8126);

const chrome = spawn(process.env.CHROME || 'google-chrome', ['--headless=new', '--no-sandbox', '--remote-debugging-port=9338',
  '--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-')), 'about:blank'], { stdio: 'ignore' });
let targets; for (let i = 0; i < 50; i++) { try { targets = await (await fetch('http://127.0.0.1:9338/json')).json(); if (targets.length) break; } catch (e) {} await sleep(200); }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => (await cdp('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

const found = {};
const audit = async (tag) => {
  await ev(AXE + ';0');
  const r = await ev(`axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice']}, resultTypes:['violations']})
    .then(r=>r.violations.map(v=>({id:v.id, impact:v.impact, help:v.help, t:v.nodes.slice(0,3).map(n=>n.target.join(' ')+' → '+String(n.failureSummary||'').split(String.fromCharCode(10)).slice(1,2).join('').trim())})))`);
  if (!Array.isArray(r)) { (found['axe-no-ejecutado'] ||= { impact: 'critical', help: 'axe no se pudo ejecutar', where: new Set(), t: [] }).where.add(tag); return; }
  for (const v of r) (found[v.id] ||= { impact: v.impact, help: v.help, where: new Set(), t: v.t }).where.add(tag);
};
for (const W of [390, 1280]) for (const dark of [false, true]) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: 844, deviceScaleFactor: 1, mobile: W < 700 });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
  const sfx = `${W}-${dark ? 'oscuro' : 'claro'}`;
  await cdp('Page.navigate', { url: 'http://localhost:8126/index.html?vista=cobros' }); await sleep(3000);
  for (const v of ['cobros', 'agenda', 'equipos', 'resumen', 'ajustes']) {
    await ev(`document.querySelector('[data-view="${v}"]').click()`); await sleep(600);
    await ev(`document.querySelectorAll('details.agc,details.mc').forEach(d=>d.open=true)`); await sleep(150);
    await audit(`${v}-${sfx}`);
  }
  await ev(`openCalc('')`); await sleep(600); await audit(`calc-${sfx}`);
  await ev(`openAvisos()`); await sleep(400); await audit(`avisos-${sfx}`); await ev(`document.getElementById('guide').classList.add('hidden')`);
}
ws.close(); chrome.kill(); server.close();
let graves = 0;
for (const [k, v] of Object.entries(found)) {
  const grave = v.impact === 'serious' || v.impact === 'critical'; if (grave) graves++;
  console.log(`${grave ? 'FALLA' : 'aviso'} [${v.impact}] ${k}: ${v.help}\n   en: ${[...v.where].join(', ')}\n   ${v.t.join(' | ')}`);
}
console.log(graves ? `${graves} incumplimientos serios` : `Sin incumplimientos serios (${Object.keys(found).length} menores).`);
process.exit(graves ? 1 : 0);
