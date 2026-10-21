-- Suscripciones a notificaciones (Web Push) de cada móvil o navegador. Sin políticas: solo la función notify
-- (service role) las lee y escribe; así un mismo dispositivo puede pasar de un árbitro a otro sin chocar con RLS.
create table public.push_subs (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  last_sent  timestamptz
);
alter table public.push_subs enable row level security;
