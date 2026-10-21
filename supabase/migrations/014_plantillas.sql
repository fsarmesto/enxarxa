-- Foto de afiliado del árbitro (cabecera de iSquad): identifica a la persona en las plantillas públicas.
alter table public.profiles add column foto text;

-- Índice de plantillas de la web pública de resultados. De cada persona solo se guarda una huella (HMAC con un
-- secret) de su foto y de su nombre, y su perfil (jugador, entrenador...): nunca el nombre legible.
create table public.pub_teams (
  id_equipo  text primary key,
  club_id    text not null,
  name       text not null,
  cat        text not null,
  checked_at timestamptz
);
alter table public.pub_teams enable row level security;

create table public.roster_idx (
  id_equipo text not null references public.pub_teams(id_equipo) on delete cascade,
  h         text not null,
  perfil    text,
  primary key (id_equipo, h)
);
create index roster_idx_h on public.roster_idx (h);
alter table public.roster_idx enable row level security;

-- Favoritos que la app añade sola (encontrado en una plantilla) y los que el árbitro ha quitado (no se vuelven a añadir).
alter table public.fav_teams add column auto boolean not null default false;
alter table public.fav_teams add column oculto boolean not null default false;
