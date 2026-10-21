-- Equipos que sigue cada árbitro (favoritos) y caché compartida de las páginas públicas de iSquad
-- (resultadosvoleibol.isquad.es). La caché solo la usa la función equipos (service role).
create table public.pub_cache (
  key        text primary key,
  data       jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.pub_cache enable row level security;

create table public.fav_teams (
  user_id    uuid not null references auth.users(id) on delete cascade,
  club_id    text not null,
  team       text not null,      -- nombre del equipo tal como sale en iSquad
  cat        text not null,      -- categoría ("CUARTA DIVISION SENIOR")
  club       text,
  id_equipo  text,
  rol        text,               -- 'jugador' | 'entrenador' | null (lo sigue sin estar en la plantilla)
  created_at timestamptz not null default now(),
  primary key (user_id, club_id, team, cat)
);
alter table public.fav_teams enable row level security;
create policy "favoritos propios: leer" on public.fav_teams for select to authenticated using (user_id = auth.uid());
