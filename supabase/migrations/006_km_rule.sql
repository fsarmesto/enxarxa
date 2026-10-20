-- Con qué ruta se calcularon los km: 'corta' (la más corta de las rutas razonables, como paga la FCVB) o 'rapida'
-- (ORS Matrix, de reserva). Los que no son 'corta' se recalculan poco a poco en cada pasada, según el cupo de ORS.
alter table public.venues add column km_rule text;
