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
