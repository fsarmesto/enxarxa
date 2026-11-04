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
// Tablets del acta (migración 039): tablas acta_mesa y acta_formacion y las RPC tablet_estado, tablet_enviar_formacion y
// limpiar_mesas, con el mismo contrato que el SQL (comprobado aparte en PGlite). En localStorage (todas las pestañas del
// mismo Chrome lo comparten: sirve para simular varios dispositivos). localStorage 'mock-caido' = 'todo' (nadie llega al
// servidor) o 'anotador' (solo falla lo que hace el anotador: escribir y leer formaciones; las tablets siguen leyendo).
MOCK += `
(()=>{ const orig = window.supabase.createClient; window.supabase.createClient = (...a) => { const c = orig(...a); const from = c.from; const rpc = c.rpc;
  const L = (k, d) => JSON.parse(localStorage.getItem(k) || d), S = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const caido = (quien) => { const v = localStorage.getItem('mock-caido'); return v === 'todo' || (v === 'anotador' && quien === 'anotador'); };
  const FALLO = { data: null, error: { message: 'Failed to fetch (simulado)' } };
  const TOK = /^[a-z0-9]{24,48}$/, DORS = /^(00|0|[1-9][0-9]?)$/;
  c.rpc = (n, b) => {
    if (n === 'limpiar_mesas') { if (caido('anotador')) return Promise.resolve(FALLO); const m = L('mock-mesa', '{}'), lim = Date.now() - 2 * 864e5; for (const k of Object.keys(m)) if (Date.parse(m[k].updated_at) < lim) delete m[k]; S('mock-mesa', m); return Promise.resolve({ data: null, error: null }); }
    if (n === 'tablet_estado') {
      if (caido('tablet')) return Promise.resolve(FALLO);
      const m = Object.values(L('mock-mesa', '{}')).find((x) => TOK.test(b.tok || '') && [x.tok_arb, x.tok_entl, x.tok_entv].includes(b.tok));
      if (!m) return Promise.resolve({ data: null, error: null });
      const rol = m.tok_arb === b.tok ? 'arbitro' : m.tok_entl === b.tok ? 'entL' : 'entV';
      const forms = L('mock-form', '[]').filter((f) => f.mesa_id === m.id && (rol === 'arbitro' || f.eq === (rol === 'entL' ? 'L' : 'V'))).sort((x, y) => x.set_n - y.set_n || x.eq.localeCompare(y.eq))
        .map((f) => ({ eq: f.eq, set: f.set_n, jugadores: f.jugadores, enviada: f.enviada_at, cerrada: f.cerrada }));
      return Promise.resolve({ data: JSON.parse(JSON.stringify({ rol, estado: m.estado, edad: Math.round((Date.now() - Date.parse(m.updated_at)) / 100) / 10, formaciones: forms })), error: null });
    }
    if (n === 'tablet_enviar_formacion') {
      if (caido('tablet')) return Promise.resolve(FALLO);
      const r = (x) => Promise.resolve({ data: x, error: null });
      const m = Object.values(L('mock-mesa', '{}')).find((x) => TOK.test(b.tok || '') && [x.tok_entl, x.tok_entv].includes(b.tok));
      if (!m) return r({ error: 'enlace' });
      const eq = m.tok_entl === b.tok ? 'L' : 'V', d = b.dorsales;
      if (!Array.isArray(d) || d.length !== 6 || d.some((x) => typeof x !== 'string' || !DORS.test(x)) || new Set(d).size !== 6) return r({ error: 'no valida' });
      const ab = m.estado && m.estado.abierta; if (b.n == null || !(ab >= 1 && ab <= 6) || ab !== b.n) return r({ error: 'set empezado' });
      const fs = L('mock-form', '[]'); if (fs.some((f) => f.mesa_id === m.id && f.eq === eq && f.set_n === b.n)) return r({ error: 'ya enviada' });
      const enviada_at = new Date().toISOString(); fs.push({ mesa_id: m.id, eq, set_n: b.n, jugadores: [...d], enviada_at, cerrada: false }); S('mock-form', fs);
      return r({ ok: true, enviada: enviada_at });
    }
    return rpc(n, b);
  };
  const from2 = c.from;
  c.from = (t) => { if (t !== 'acta_mesa' && t !== 'acta_formacion') return from2(t);
    const filtros = []; let accion = 'select', datos = null;
    const filas = () => t === 'acta_mesa' ? Object.values(L('mock-mesa', '{}')) : L('mock-form', '[]');
    const casa = (f) => filtros.every(([k, v]) => f[k] === v);
    const ejecutar = () => {
      if (caido('anotador')) return FALLO;
      if (accion === 'upsert') { const m = L('mock-mesa', '{}'); m[datos.id] = { ...(m[datos.id] || {}), ...datos, user_id: 'u-demo', updated_at: new Date().toISOString() }; S('mock-mesa', m); return { data: null, error: null }; }
      if (accion === 'delete') { if (t === 'acta_mesa') { const m = L('mock-mesa', '{}'); for (const f of Object.values(m)) if (casa(f)) { delete m[f.id]; S('mock-form', L('mock-form', '[]').filter((x) => x.mesa_id !== f.id)); } S('mock-mesa', m); } return { data: null, error: null }; }
      if (accion === 'update') { if (t !== 'acta_formacion' || Object.keys(datos).some((k) => k !== 'cerrada')) return { data: null, error: { message: 'permission denied' } }; S('mock-form', filas().map((f) => casa(f) ? { ...f, ...datos } : f)); return { data: null, error: null }; }
      return { data: JSON.parse(JSON.stringify(filas().filter(casa))), error: null };
    };
    const q = { select() { return q; }, eq(k, v) { filtros.push([k, v]); return q; }, order() { return q; },
      upsert(row) { accion = 'upsert'; datos = row; return q; }, update(o) { accion = 'update'; datos = o; return q; }, delete() { accion = 'delete'; return q; },
      maybeSingle: async () => { const r = ejecutar(); return { data: r.data && r.data[0] || null, error: r.error }; },
      then(ok, ko) { return Promise.resolve(ejecutar()).then(ok, ko); } };
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
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--remote-debugging-port=9339', '--user-data-dir=' + PERFIL, 'about:blank'], { stdio: 'ignore' });
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
// Otra pestaña (otro "dispositivo": comparte localStorage, así que comparte el Supabase simulado). Devuelve sus propias
// utilidades: go, ev, click, type, size, shot, cdp, errores y cerrar. Antes de cada acción se trae al frente (Chrome sin
// ventana frena los temporizadores de las pestañas de fondo).
export const pestana = async (url = 'about:blank') => {
  const t = await cdp('Target.createTarget', { url: url.startsWith('/') ? 'http://localhost:8127' + url : url });
  const tid = t.result.targetId;
  let lista; for (let i = 0; i < 30; i++) { lista = await (await fetch('http://127.0.0.1:9339/json')).json(); if (lista.some((x) => x.id === tid)) break; await sleep(100); }
  const w = new WebSocket(lista.find((x) => x.id === tid).webSocketDebuggerUrl); await new Promise((r) => (w.onopen = r));
  let n = 0; const pp = new Map(), evs = [];
  w.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pp.has(m.id)) { pp.get(m.id)(m); pp.delete(m.id); } else if (m.method) { evs.push(m); if (m.method === 'Page.javascriptDialogOpening') c('Page.handleJavaScriptDialog', { accept: true }); } };
  const c = (method, params = {}) => new Promise((r) => { const i = ++n; pp.set(i, r); w.send(JSON.stringify({ id: i, method, params })); });
  await c('Page.enable'); await c('Runtime.enable');
  const frente = () => c('Page.bringToFront');
  const e2 = async (x) => { const r = await c('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error('JS: ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); return r.result?.result?.value; };
  const api = {
    cdp: c, ev: e2,
    go: async (u, wait = 1500) => { await frente(); await c('Page.navigate', { url: 'http://localhost:8127' + u }); await sleep(wait); await e2('window.ACTA_ANTIRREBOTE = 0').catch(() => {}); },
    click: async (sel) => {
      await frente();
      const r = await e2(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>x.getClientRects().length) || document.querySelector(${JSON.stringify(sel)}); if(!e) return null; e.scrollIntoView({block:'center'}); const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
      if (!r) throw new Error('no existe ' + sel);
      for (const type of ['mousePressed', 'mouseReleased']) await c('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await sleep(350);
    },
    size: async (wd, h = 900, dark = false) => { await c('Emulation.setDeviceMetricsOverride', { width: wd, height: h, deviceScaleFactor: 1, mobile: wd < 700 }); await c('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] }); },
    shot: async (nm) => { await frente(); const r = await c('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(process.env.OUT, nm + '.png'), Buffer.from(r.result.data, 'base64')); },
    errores: () => evs.filter((x) => x.method === 'Runtime.exceptionThrown').map((x) => x.params.exceptionDetails.exception?.description || x.params.exceptionDetails.text),
    frente, cerrar: async () => { w.close(); await cdp('Target.closeTarget', { targetId: tid }); },
  };
  return api;
};
