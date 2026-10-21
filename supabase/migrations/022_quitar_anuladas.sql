-- Los partidos que ya no existen en iSquad se borran en vez de marcarse (cancelled_at, migración 021). Las 2 filas
-- marcadas eran duplicados: iSquad cambió el código del partido (3JFGH041 → 3JFGH041@2026-10-25T12:00) y la fila nueva
-- ya está guardada; las viejas no tenían nada puesto a mano.
delete from public.matches where cancelled_at is not null;
alter table public.matches drop column cancelled_at;
