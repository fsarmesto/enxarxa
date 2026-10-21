-- Equipos que el árbitro sigue pero no quiere en "Mis partidos" (p. ej. tiene ficha "por si acaso"): siguen en la
-- lista de equipos, desactivados.
alter table public.fav_teams add column activo boolean not null default true;
