// Importa OUT/acta-demo.json (lo deja demo-completo.mjs) con el botón "Importar un acta (JSON)" y abre el acta FCVB.
import os from 'node:os'; import path from 'node:path';
import { go, ev, click, size, check, resumen, fin, errores, sleep, cdp, shot } from './base.mjs';
await size(1440, 900); await go('/acta/', 800); await ev('localStorage.clear()'); await go('/acta/', 1500);
const doc = await cdp('DOM.getDocument', {}); const q = await cdp('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#importar' });
await cdp('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [path.join(process.env.OUT, 'acta-demo.json')] });
await sleep(1500);
check((await ev(`document.body.innerText`)).includes('Gana Equipo F 3-2'), 'importada: "Gana Equipo F 3-2"');
await click('#ver'); await sleep(300); await click('label:has(input[name=modo][value=fcvb])'); await sleep(1200);
check(await ev(`document.querySelectorAll('.fcvb-pagina').length`) >= 1, 'acta FCVB');
await shot('importada');
check(!errores().length, 'sin errores de JavaScript ' + JSON.stringify(errores().slice(0, 2)));
await fin(); process.exit(resumen() ? 1 : 0);
