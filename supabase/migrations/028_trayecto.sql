-- Tiempo de trayecto en coche junto a "Cómo llegar" (issue #29): minutos de ida desde la población de origen, sin
-- tráfico, de la misma consulta a OpenRouteService que da los km. Los km puestos a mano no cambian la duración.
alter table public.venues add column min smallint;
alter table public.route_cache add column min smallint;

-- Al cambiar de población, la duración ya no vale: se vacía y la siguiente pasada la vuelve a calcular.
create or replace function public.reset_origin_coords() returns trigger language plpgsql set search_path = public as $$
begin
  if new.origin is distinct from old.origin then
    new.origin_lon := null; new.origin_lat := null;
    update public.venues set km_tried_at = null where user_id = new.user_id and km is null;
    update public.venues set min = null where user_id = new.user_id and min is not null;
  end if;
  return new;
end $$;
