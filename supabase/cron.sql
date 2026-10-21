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
