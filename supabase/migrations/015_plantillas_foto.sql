-- Si la persona de la plantilla tenía foto de afiliado. Una coincidencia solo por nombre con alguien que SÍ tiene
-- foto (y no es la del árbitro) es un homónimo: no cuenta.
alter table public.roster_idx add column con_foto boolean not null default false;
