-- Compartir coche: el árbitro acepta que otros árbitros que también lo tengan activado vean que ese día va al mismo
-- pabellón o a la misma población (nombre, hora, pabellón y población de salida).
alter table public.profiles add column coche boolean not null default false;
