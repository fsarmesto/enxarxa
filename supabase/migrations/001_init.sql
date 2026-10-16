-- Liquidación arbitral FCVB: esquema inicial

create table public.profiles (
  user_id      uuid primary key references auth.users on delete cascade,
  login_key    text unique not null,          -- usuario de iSquad en minúsculas
  isquad_login text not null,                 -- usuario de iSquad tal cual se escribió
  origin       text not null,                 -- población de residencia
  rate         numeric not null default 0.26, -- €/km
  min_travel   numeric not null default 4,    -- mínimo por desplazamiento
  last_sync    timestamptz,
  last_error   text,
  created_at   timestamptz not null default now()
);

-- Contraseñas de iSquad, cifradas con AES-GCM (la clave está solo en los secrets de las funciones).
create table public.isquad_credentials (
  user_id    uuid primary key references auth.users on delete cascade,
  secret     text not null,
  updated_at timestamptz not null default now()
);

create table public.matches (
  user_id     uuid not null references auth.users on delete cascade,
  id          text not null,                  -- código de partido de iSquad (o MAN-… si es manual)
  comp        text, phase text, teams text, estado text,
  date        date not null,
  time        text not null,
  venue       text, addr text, venue_key text,
  last_seen   timestamptz not null default now(),
  -- campos que marca el árbitro (la sincronización no los toca)
  cat         text,
  team        text not null default 't1',
  role        text not null default 'r1',
  tolls       numeric not null default 0,
  holiday     boolean not null default false,
  no_dieta    boolean,
  paid        boolean not null default false,
  km_override numeric,
  primary key (user_id, id)
);

create table public.venues (
  user_id   uuid not null references auth.users on delete cascade,
  venue_key text not null,
  label     text,
  km        numeric,                          -- km de ida
  primary key (user_id, venue_key)
);

alter table public.profiles           enable row level security;
alter table public.isquad_credentials enable row level security;
alter table public.matches            enable row level security;
alter table public.venues             enable row level security;

-- Credenciales: sin políticas => solo las funciones (service role) pueden leerlas.
revoke all on public.isquad_credentials from anon, authenticated;

create policy "perfil propio: leer"   on public.profiles for select to authenticated using (user_id = auth.uid());
create policy "perfil propio: editar" on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (origin, rate, min_travel) on public.profiles to authenticated;

create policy "partidos propios" on public.matches for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "pabellones propios" on public.venues for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.profiles, public.matches, public.venues from anon;
