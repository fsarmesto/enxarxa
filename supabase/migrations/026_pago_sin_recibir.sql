-- "Pagado" en iSquad que aún no ha llegado (el árbitro lo desmarca en Cobros): la web lo cuenta como pendiente.
-- Lo marca el árbitro; la sincronización no lo toca (y lo pasa a la fila nueva si el partido cambia de código).
alter table public.matches add column not_received boolean not null default false;
