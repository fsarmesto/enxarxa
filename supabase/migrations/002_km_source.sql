-- De dónde salen los km de cada pabellón: 'direccion' (calle exacta), 'poblacion' (aproximado,
-- centro de la población) o 'manual' (los ha puesto el árbitro).
alter table public.venues add column km_source text;
update public.venues set km_source = 'direccion' where km is not null;
