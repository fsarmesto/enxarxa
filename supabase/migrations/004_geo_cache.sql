-- Caché de ubicaciones (Nominatim) compartida entre árbitros: cada dirección o población se busca una sola vez.
-- found = false guarda también lo que no se encontró, para no repetir la búsqueda cada día (caduca a los 30 días).
create table public.geo_cache (
  query      text primary key,          -- 'addr:<texto>' o 'town:<texto>', normalizado
  lon        double precision,
  lat        double precision,
  exact      boolean not null default false,
  found      boolean not null,
  created_at timestamptz not null default now()
);
-- Km por carretera entre dos puntos (OpenRouteService), compartidos: árbitros del mismo pueblo no repiten rutas.
create table public.route_cache (
  key        text primary key,          -- 'lon,lat>lon,lat' redondeado a 4 decimales
  km         numeric not null,
  created_at timestamptz not null default now()
);
alter table public.geo_cache   enable row level security;
alter table public.route_cache enable row level security;
revoke all on public.geo_cache, public.route_cache from anon, authenticated;

-- Coordenadas de la población de origen: se buscan una vez y se olvidan si el árbitro cambia de población.
alter table public.profiles add column origin_lon double precision;
alter table public.profiles add column origin_lat double precision;
-- Al cambiar de población, los pabellones sin km se vuelven a intentar en la siguiente pasada.
create function public.reset_origin_coords() returns trigger language plpgsql set search_path = public as $$
begin
  if new.origin is distinct from old.origin then
    new.origin_lon := null; new.origin_lat := null;
    update public.venues set km_tried_at = null where user_id = new.user_id and km is null;
  end if;
  return new;
end $$;
create trigger profiles_origin_changed before update on public.profiles
  for each row execute function public.reset_origin_coords();

-- Candado para que solo haya un cálculo de km a la vez (en cualquier función o instancia): así se respeta
-- de verdad 1 consulta/s en Nominatim y el ritmo de ORS.
create table public.km_lock (
  id     int primary key,
  holder text,
  until  timestamptz not null default 'epoch'
);
insert into public.km_lock (id) values (1);
alter table public.km_lock enable row level security;
revoke all on public.km_lock from anon, authenticated;

-- Último intento de calcular los km de un pabellón: si no salen, no se reintenta hasta pasada una semana.
alter table public.venues add column km_tried_at timestamptz;
