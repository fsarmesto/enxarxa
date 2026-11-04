// Migración 039 (tablets del acta) en PGlite: Postgres de verdad en WASM, con auth.uid() y los roles anon/authenticated simulados.
// Uso, desde la raíz del repo: npm i --no-save @electric-sql/pglite@0.2.17 && node tools/prueba-tablets-sql.mjs
// Comprueba permisos (anon, otro usuario), el filtrado por rol de las formaciones, el bloqueo de la enviada, revocar, limpiar
// y que un token no se pueda usar en otra columna (prefijo por rol).
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const sql = fs.readFileSync(process.argv[2] || new URL('../supabase/migrations/039_acta_tablets.sql', import.meta.url), 'utf8');
const db = new PGlite();
let fallos = 0; const ok = (c, t) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + t); if (!c) fallos++; };
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
`);
await db.exec(sql);
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222';
const como = async (rol, uid, q, p) => { await db.exec(`reset role; select set_config('request.uid', '${uid || ''}', false); set role ${rol};`); try { return await db.query(q, p); } finally { await db.exec('reset role'); } };
const err = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };
const T = (c) => c.repeat(24);
const estado = (abierta) => JSON.stringify({ abierta, fase: 'preparacion', set: 1 });

// Anotador U1 crea su mesa
await como('authenticated', U1, `insert into acta_mesa (id, tok_arb, tok_entl, tok_entv, estado) values ($1,$2,$3,$4,$5)`, [T('m'), T('a'), T('l'), T('v'), estado(1)]);
ok((await como('authenticated', U1, 'select count(*)::int n from acta_mesa')).rows[0].n === 1, 'el anotador ve su mesa');
// upsert (como supabase-js: insert ... on conflict do update)
await como('authenticated', U1, `insert into acta_mesa (id, tok_arb, tok_entl, tok_entv, estado) values ($1,$2,$3,$4,$5) on conflict (id) do update set estado = excluded.estado, tok_arb = excluded.tok_arb, tok_entl = excluded.tok_entl, tok_entv = excluded.tok_entv`, [T('m'), T('a'), T('l'), T('v'), estado(1)]);
ok(true, 'upsert del anotador');
// Otro usuario no la ve ni la toca
ok((await como('authenticated', U2, 'select count(*)::int n from acta_mesa')).rows[0].n === 0, 'otro usuario no ve la mesa');
const up2 = await como('authenticated', U2, `update acta_mesa set estado='{}' where id=$1`, [T('m')]); ok(up2.affectedRows === 0, 'otro usuario no la puede cambiar');
ok(!!(await err(() => como('authenticated', U2, `insert into acta_mesa (id, tok_arb, tok_entl, tok_entv, estado) values ($1,$2,$3,$4,'{}') on conflict (id) do update set estado='{}'`, [T('m'), T('a'), T('l'), T('v')]))), 'otro usuario no puede pisarla con upsert');
// anon: nada directo
ok(!!(await err(() => como('anon', null, 'select * from acta_mesa'))), 'anon no lee acta_mesa: ' + (await err(() => como('anon', null, 'select * from acta_mesa'))));
ok(!!(await err(() => como('anon', null, 'select * from acta_formacion'))), 'anon no lee acta_formacion');
ok(!!(await err(() => como('anon', null, `insert into acta_formacion values ($1,'L',1,'{1,2,3,4,5,6}')`, [T('m')]))), 'anon no inserta formaciones');
// Ataque de la revisión: otro usuario crea su mesa con el token de árbitros de la mesa de U1 en la columna de entrenador
ok(!!(await err(() => como('authenticated', U2, `insert into acta_mesa (id, tok_arb, tok_entl, tok_entv) values ($1,$2,$3,$4)`, [T('q'), 'a' + 'q'.repeat(23), T('a'), 'v' + 'q'.repeat(23)]))), 'un token de árbitros no se puede usar como token de entrenador (prefijo por rol)');
ok(!!(await err(() => como('authenticated', U2, `insert into acta_mesa (id, tok_arb, tok_entl, tok_entv) values ($1,$2,$3,$4)`, [T('q'), T('a'), 'l' + 'q'.repeat(23), 'v' + 'q'.repeat(23)]))), 'ni repetir el token de árbitros de otra mesa (unique)');
// RPC estado
const est = async (tok) => (await como('anon', null, 'select tablet_estado($1) r', [tok])).rows[0].r;
ok((await est(T('a'))).rol === 'arbitro', 'token árbitro → rol arbitro');
ok((await est(T('l'))).rol === 'entL' && (await est(T('v'))).rol === 'entV', 'tokens de entrenador → entL / entV');
ok((await est(T('x'))) === null, 'token falso → null');
ok((await est("' or 1=1 --")) === null, 'token raro → null');
ok(typeof (await est(T('a'))).edad === 'number' && (await est(T('a'))).edad < 5, 'edad en segundos (hora del servidor)');
// Enviar formación
const env = async (tok, n, d) => (await como('anon', null, 'select tablet_enviar_formacion($1,$2,$3) r', [tok, n, d])).rows[0].r;
ok((await env(T('a'), 1, ['1', '2', '3', '4', '5', '6'])).error === 'enlace', 'el token del árbitro no envía');
ok((await env(T('l'), 1, ['1', '2', '3', '4', '5'])).error === 'no valida', '5 dorsales → no válida');
ok((await env(T('l'), 1, ['1', '2', '3', '4', '5', '5'])).error === 'no valida', 'repetido → no válida');
ok((await env(T('l'), 1, ['1', '2', '3', '4', '5', '07'])).error === 'no valida', '"07" → no válida');
ok((await env(T('l'), 1, ['1', '2', '3', '4', '5', '100'])).error === 'no valida', '"100" → no válida');
ok((await env(T('l'), 2, ['1', '2', '3', '4', '5', '6'])).error === 'set empezado', 'set que no está abierto → rechazado');
const r1 = await env(T('l'), 1, ['1', '2', '3', '4', '5', '00']); ok(r1.ok === true && !!r1.enviada, 'local envía la del set 1');
ok((await env(T('l'), 1, ['7', '2', '3', '4', '5', '6'])).error === 'ya enviada', 'reenviar → ya enviada (bloqueada)');
// Filtrado por rol
const fV = (await est(T('v'))).formaciones; ok(Array.isArray(fV) && fV.length === 0, 'el visitante NO recibe la formación del local');
const fA = (await est(T('a'))).formaciones; ok(fA.length === 1 && fA[0].eq === 'L' && fA[0].jugadores.join() === '1,2,3,4,5,00', 'el árbitro la recibe en cuanto llega');
const fL = (await est(T('l'))).formaciones; ok(fL.length === 1 && fL[0].set === 1 && fL[0].cerrada === false, 'el local ve la suya');
await env(T('v'), 1, ['9', '8', '7', '6', '5', '4']);
ok((await est(T('l'))).formaciones.length === 1 && (await est(T('a'))).formaciones.length === 2, 'tras enviar el visitante: local 1, árbitro 2');
// El anotador las lee y las cierra; no puede cambiar dorsales
ok((await como('authenticated', U1, 'select count(*)::int n from acta_formacion where mesa_id=$1 and set_n=1', [T('m')])).rows[0].n === 2, 'el anotador lee las formaciones');
ok((await como('authenticated', U2, 'select count(*)::int n from acta_formacion')).rows[0].n === 0, 'otro usuario no las lee');
await como('authenticated', U1, 'update acta_formacion set cerrada=true where mesa_id=$1 and set_n=1', [T('m')]);
ok((await est(T('l'))).formaciones[0].cerrada === true, 'cerrada al empezar el set');
ok(!!(await err(() => como('authenticated', U1, `update acta_formacion set jugadores='{1,2,3,4,5,6}' where mesa_id=$1`, [T('m')]))), 'el anotador no puede cambiar los dorsales enviados');
// Set abierto cambia
await como('authenticated', U1, 'update acta_mesa set estado=$2 where id=$1', [T('m'), estado(null)]);
ok((await env(T('l'), 2, ['1', '2', '3', '4', '5', '6'])).error === 'set empezado', 'con el set en juego (abierta null) no se envía');
await como('authenticated', U1, 'update acta_mesa set estado=$2 where id=$1', [T('m'), estado(2)]);
ok((await env(T('l'), 2, ['1', '2', '3', '4', '5', '6'])).ok === true, 'set 2 abierto → se envía');
// Revocar: tokens nuevos → los viejos dejan de valer
await como('authenticated', U1, 'update acta_mesa set tok_entl=$2 where id=$1', [T('m'), 'l' + 'n'.repeat(23)]);
ok((await est(T('l'))) === null && (await est('l' + 'n'.repeat(23))).rol === 'entL', 'revocar: el enlace viejo deja de valer');
// Tamaño
ok(!!(await err(() => como('authenticated', U1, 'update acta_mesa set estado=$2 where id=$1', [T('m'), JSON.stringify({ x: 'y'.repeat(40000) })]))), 'estado > 30 kB rechazado');
// limpiar_mesas: anon no; borrar cascada
ok(!!(await err(() => como('anon', null, 'select limpiar_mesas()'))), 'anon no puede llamar a limpiar_mesas');
await db.exec(`alter table acta_mesa disable trigger acta_mesa_hora; update acta_mesa set updated_at = now() - interval '3 days'; alter table acta_mesa enable trigger acta_mesa_hora;`);
await como('authenticated', U2, 'select limpiar_mesas()');
ok((await db.query('select count(*)::int n from acta_formacion')).rows[0].n === 0 && (await db.query('select count(*)::int n from acta_mesa')).rows[0].n === 0, 'limpiar_mesas borra las de más de 2 días (y sus formaciones)');
// Dejar de compartir = delete
await como('authenticated', U1, `insert into acta_mesa (id, tok_arb, tok_entl, tok_entv) values ($1,$2,$3,$4)`, [T('z'), 'a' + 'b'.repeat(23), 'l' + 'c'.repeat(23), 'v' + 'd'.repeat(23)]);
await como('authenticated', U1, 'delete from acta_mesa where id=$1', [T('z')]);
ok((await est('a' + 'b'.repeat(23))) === null, 'dejar de compartir: el enlace deja de valer');
console.log(fallos ? `${fallos} fallos` : 'Todo OK'); process.exit(fallos ? 1 : 0);
