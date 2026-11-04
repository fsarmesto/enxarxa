-- Sincronización automática: 8:00 y 16:00 (hora peninsular en invierno; en verano, 9:00 y 17:00).
-- Sustituye TU_PROYECTO y TU_CRON_SECRET antes de ejecutarlo en el SQL Editor.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'sync-isquad',
  '0 7,15 * * *',
  $$
  select net.http_post(
    url     := 'https://TU_PROYECTO.supabase.co/functions/v1/sync',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "TU_CRON_SECRET"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Recordatorio del domingo a las 20:00 de Madrid (función notify). Se lanza a las 18 y a las 19 UTC para cubrir
-- horario de verano e invierno; la función solo envía si en Madrid son las 20.
select cron.schedule(
  'recordatorio-domingo',
  '0 18,19 * * 0',
  $$
  select net.http_post(
    url     := 'https://TU_PROYECTO.supabase.co/functions/v1/notify',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "TU_CRON_SECRET"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Resultados sin subir de la semana (issue #31): domingo a las 21:00 de Madrid (función notify con tipo resultados). Se
-- lanza a las 19 y a las 20 UTC; la función solo envía si en Madrid son las 21.
select cron.schedule(
  'aviso-resultados',
  '0 19,20 * * 0',
  $$
  select net.http_post(
    url     := 'https://TU_PROYECTO.supabase.co/functions/v1/notify',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "TU_CRON_SECRET"}'::jsonb,
    body    := '{"tipo":"resultados"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Cuentas sin usar 6 meses: aviso 30 días antes y borrado (función inactivas). Cada día a las 10:00 UTC.
select cron.schedule(
  'inactivas',
  '0 10 * * *',
  $$
  select net.http_post(
    url     := 'https://TU_PROYECTO.supabase.co/functions/v1/inactivas',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "TU_CRON_SECRET"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Hora de salida hacia el pabellón (issue #73, función salida): cada 5 minutos; la función no hace nada antes de las 5:00
-- de Madrid ni entra en iSquad (solo lee la base de datos).
select cron.schedule(
  'aviso-salida',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://TU_PROYECTO.supabase.co/functions/v1/salida',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "TU_CRON_SECRET"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Las 3 que siguen ya estaban programadas en el proyecto pero faltaban en este fichero (revisión del 2-nov-2026).

-- Avisos al momento (función vigilar): cada 10 minutos; la función no hace nada antes de las 7:00 de Madrid.
select cron.schedule(
  'vigilar',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://TU_PROYECTO.supabase.co/functions/v1/vigilar',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "TU_CRON_SECRET"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Miércoles (día en que la FCVB suelta las designaciones en bloque; decisión de Ferran, 4-nov-2026): vigilar cada 2 minutos
-- de 9:00 a 18:58 de Madrid en horario de INVIERNO (8-17 UTC; en verano poner 7-16). Se salta los minutos del de cada 10
-- para que nunca vayan 2 a la vez. Mismo comando que 'vigilar' (ficha pública, sin login salvo si cambia).
select cron.schedule(
  'vigilar-miercoles',
  '2,4,6,8,12,14,16,18,22,24,26,28,32,34,36,38,42,44,46,48,52,54,56,58 8-17 * * 3',
  $$
  select net.http_post(
    url     := 'https://TU_PROYECTO.supabase.co/functions/v1/vigilar',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "TU_CRON_SECRET"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Índice de plantillas de la web pública (función indexar): cada 15 minutos; solo trabaja con lo caducado (14 días).
select cron.schedule(
  'indexar-plantillas',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://TU_PROYECTO.supabase.co/functions/v1/indexar',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "TU_CRON_SECRET"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Designaciones publicadas y salud de la app (función designadas, avisos a los admins y "Han empezado a designar"):
-- cada hora a y 5; la función solo trabaja de 8 a 22 h de Madrid.
select cron.schedule(
  'designadas-hora',
  '5 * * * *',
  $$
  select net.http_post(
    url     := 'https://TU_PROYECTO.supabase.co/functions/v1/designadas',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "TU_CRON_SECRET"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
