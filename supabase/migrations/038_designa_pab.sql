-- Pabellones del panel del designador (4-nov-2026): ubicados de antemano para toda la temporada (Ferran: "tendrían que
-- ir pre-cargados; solo que se unan los partidos a los pabellones"). La clave es el nombre sin "- PISTA n" (sinPista).
-- origen 'auto': lo ubica la función designa (acción precargar, cron de cada noche, o al momento si sale uno nuevo);
--   lon/lat null = no encontrado (se vuelve a buscar a los 30 días).
-- origen 'manual': lo ha ubicado el designador ("Ubicar"); manda y no se vuelve a buscar.
create table public.designa_pab (
  pab_key     text primary key,
  nombre      text not null,
  origen      text not null default 'auto' check (origen in ('auto','manual')),
  fuente      text,                        -- auto: isquad (dirección de una designación), cp, nombre; manual: null
  texto       text,                        -- manual: lo que escribió el designador
  lon         double precision,
  lat         double precision,
  buscado_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.designa_pab enable row level security;
revoke all on public.designa_pab from anon, authenticated;
