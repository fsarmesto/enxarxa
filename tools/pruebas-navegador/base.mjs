// Banco de pruebas de navegador (Chrome sin ventana por CDP): sirve docs/ en http://localhost:8127 con un supabase simulado
// (el de tools/prueba-accesibilidad.mjs + la tabla acta_directo en localStorage) y da clics reales. Ver README.md.
// Variables: REPO (por defecto, la raíz de este repo), OUT (capturas y PDF; por defecto la carpeta temporal), CHROME (ruta
// del ejecutable; por defecto la habitual de cada sistema).
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.REPO || path.resolve(AQUI, '..', '..'), DOCS = path.join(REPO, 'docs');
process.env.OUT ||= os.tmpdir();
const a11y = fs.readFileSync(path.join(REPO, 'tools/prueba-accesibilidad.mjs'), 'utf8');
let MOCK = eval('`' + a11y.split('const MOCK = `')[1].split('})();`;')[0] + '})();' + '`');
MOCK = MOCK.replace('functions\\/v1\\//', 'functions\\/v1\\/(?!designa)/')
  .replace("getSession: async () => ({ data: { session: { access_token: 't', user: { id: 'u-demo' } } } })",
           "getSession: async () => ({ data: { session: localStorage.getItem('mock-session') ? { access_token: 't', user: { id: 'u-demo' } } : null } })");
MOCK = MOCK.replace('gte() { return o },', 'gte() { return o }, lte() { return o },');
if (!MOCK.includes("localStorage.getItem('mock-session')") || !MOCK.includes('(?!designa)')) throw new Error('no se ha podido adaptar el mock');
// Tabla acta_directo simulada (en localStorage, compartida entre la página del acta y la del directo).
MOCK += `
(()=>{ const orig = window.supabase.createClient; window.supabase.createClient = (...a) => { const c = orig(...a); const from = c.from; const rpc = c.rpc;
  c.rpc = (n, b) => n === 'limpiar_directos' ? Promise.resolve({ data: null, error: null }) : rpc(n, b);
  c.from = (t) => { if (t !== 'acta_directo') return from(t);
    const db = () => JSON.parse(localStorage.getItem('mock-directo') || '{}'), save = (d) => localStorage.setItem('mock-directo', JSON.stringify(d));
    let filtro = null; const q = { select() { return q; }, eq(k, v) { filtro = v; return q; },
      maybeSingle: async () => ({ data: db()[filtro] || null, error: null }),
      upsert: async (row) => { const d = db(); d[row.id] = { estado: row.estado, updated_at: row.updated_at }; save(d); return { error: null }; },
      delete() { return { eq: async (k, v) => { const d = db(); delete d[v]; save(d); return { error: null }; } }; } };
    return q; };
  return c; }; })();`;
// Simulador opcional de la función designa (no hace falta para el acta).
const DESIGNA = fs.existsSync(path.join(AQUI, 'mock-designa.js')) ? fs.readFileSync(path.join(AQUI, 'mock-designa.js'), 'utf8') : '';
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  if (p.endsWith('/vendor/supabase-2.45.4.js')) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(MOCK); }
  if (p.endsWith('/config.js')) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(fs.readFileSync(path.join(DOCS, 'config.js'), 'utf8') + '\n' + DESIGNA); }
  if (p === '/sw.js') { res.writeHead(404); return res.end(); }
  if (process.env.ACTA_CA && p.endsWith('/acta/acta-ca.js')) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(fs.readFileSync(path.join(DOCS, 'acta/acta-ca.js'), 'utf8').replace("let LANG = 'es';", "let LANG = 'ca'; const FORZADO = 1;").replace(/try \{ LANG = localStorage[^\n]*\n/, '').replace("  return out === k ? text : text.replace(k, out);", "  if (out === k) { const S = JSON.parse(sessionStorage.getItem('sinTr') || '[]'); if (!S.includes(k)) { S.push(k); sessionStorage.setItem('sinTr', JSON.stringify(S)); } }\n  return out === k ? text : text.replace(k, out);")); }
  const f = path.join(DOCS, p);
  if (!f.startsWith(DOCS) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(8127);
// Un solo perfil, que se vacía al empezar: Chrome deja procesos escribiendo un momento después de cerrarse y borrarlo al
// acabar no siempre funcionaba (cada perfil ~180 MB llegó a llenar /tmp).
const PERFIL = path.join(os.tmpdir(), 'dsg-perfil');
fs.rmSync(PERFIL, { recursive: true, force: true }); fs.mkdirSync(PERFIL, { recursive: true });
const CHROME = process.env.CHROME || { win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }[process.platform] || '/usr/bin/google-chrome';
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--remote-debugging-port=9339', '--user-data-dir=' + PERFIL, 'about:blank'], { stdio: 'ignore' });
// El perfil de Chrome ocupa ~180 MB: se borra al acabar (antes llenaban /tmp).
process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch (e) {} try { fs.rmSync(PERFIL, { recursive: true, force: true, maxRetries: 5 }); } catch (e) {} });
let targets; for (let i = 0; i < 50; i++) { try { targets = await (await fetch('http://127.0.0.1:9339/json')).json(); if (targets.length) break; } catch (e) {} await sleep(200); }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(); export const events = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method) { events.push(m); if (m.method === 'Page.javascriptDialogOpening') cdp('Page.handleJavaScriptDialog', { accept: true }); } };
export const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
export const ev = async x => { const r = await cdp('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error('JS: ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); return r.result?.result?.value; };
await cdp('Page.enable'); await cdp('Runtime.enable');
// Las pruebas pulsan más rápido que una persona: sin el filtro de doble toque del acta (se prueba aparte en antirrebote.mjs).
export const go = async (url, wait = 1500) => { await cdp('Page.navigate', { url: 'http://localhost:8127' + url }); await sleep(wait); if (!process.env.CON_ANTIRREBOTE) await ev('window.ACTA_ANTIRREBOTE = 0').catch(() => {}); if (process.env.RECOGER) await ev(RECOGER_JS).catch(() => {}); };
// RECOGER=archivo: guarda todos los textos que salen en pantalla (para traducir). Se vuelcan al cambiar de página y al acabar.
const RECOGER_JS = `(()=>{ if (window.__rec) return; const S = window.__rec = new Set(JSON.parse(sessionStorage.getItem('rec')||'[]'));
  const mira = (n) => { if (n.nodeType === 3) { const t = n.nodeValue.trim(); if (t && /[a-záéíóúñ]/i.test(t) && !n.parentElement?.closest('script,style')) S.add(t); return; }
    if (n.nodeType !== 1) return; for (const a of ['placeholder','title','aria-label','value']) { const v = n.getAttribute && n.getAttribute(a); if (v && /[a-záéíóúñ]{2}/i.test(v) && !(a==='value' && n.tagName!=='INPUT')) S.add(v.trim()); }
    n.childNodes.forEach(mira); };
  mira(document.body); new MutationObserver((ms) => { for (const m of ms) { m.addedNodes.forEach(mira); if (m.type==='characterData') mira(m.target); } sessionStorage.setItem('rec', JSON.stringify([...S])); }).observe(document.body, { childList: true, subtree: true, characterData: true });
  const of = window.confirm; window.confirm = (t) => { S.add(String(t)); return of ? true : true; }; })()`;
export const volcarTextos = async () => { if (!process.env.RECOGER) return; const t = await ev(process.env.ACTA_CA ? `sessionStorage.getItem('sinTr') || '[]'` : `JSON.stringify([...(window.__rec||[])])`).catch(() => '[]'); const prev = fs.existsSync(process.env.RECOGER) ? JSON.parse(fs.readFileSync(process.env.RECOGER, 'utf8')) : []; fs.writeFileSync(process.env.RECOGER, JSON.stringify([...new Set([...prev, ...JSON.parse(t || '[]')])])); };
export const shot = async n => { const r = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(process.env.OUT, n + '.png'), Buffer.from(r.result.data, 'base64')); };
export const size = async (w, h = 900, dark = false) => { await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 }); await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] }); };
// Clic real (ratón) en el centro del elemento.
export const click = async sel => {
  const r = await ev(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>x.getClientRects().length) || document.querySelector(${JSON.stringify(sel)}); if(!e) return null; e.scrollIntoView({block:'center'}); const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  if (!r) throw new Error('no existe ' + sel);
  for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(350);
};
export const type = async (sel, text) => { await click(sel); await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); e.select&&e.select();})()`); await cdp('Input.insertText', { text }); await sleep(100); };
export const errores = () => events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);
export const fin = async () => { await volcarTextos(); ws.close(); chrome.kill(); server.close(); };
let fallos = 0; export const check = (cond, txt) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + txt); if (!cond) fallos++; }; export const resumen = () => { console.log(fallos ? `${fallos} fallos` : 'Todo OK'); return fallos; };
