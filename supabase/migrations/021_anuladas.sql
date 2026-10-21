-- Designaciones anuladas (issue #1): el partido que deja de salir en iSquad se quedaba en matches sin marca y vigilar
-- avisaba de "Designación anulada" en cada pasada. missing_since = primera lectura en la que faltó (si en la siguiente
-- sigue faltando, se da por anulado); cancelled_at = cuándo se avisó. Si vuelve a salir, el upsert pone los dos a null.
alter table public.matches add column missing_since timestamptz, add column cancelled_at timestamptz;

-- Los que ya faltaban en la última lectura de su árbitro ya se avisaron (de más): se marcan anulados sin volver a avisar.
update public.matches m set cancelled_at = now()
from (select user_id, max(last_seen) t from public.matches where id not like 'MAN-%' group by user_id) u
where u.user_id = m.user_id and m.id not like 'MAN-%' and m.date >= current_date and m.last_seen < u.t - interval '5 minutes';

-- Avisos de cambios de designación ya enviados: ningún aviso con la misma clave sale dos veces (tope contra bucles).
create table public.push_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  key     text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.push_log enable row level security;   -- sin políticas: solo las funciones (service role)
