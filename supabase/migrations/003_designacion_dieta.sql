-- Rol y equipo arbitral salen de "Ver Designación" de iSquad; la dieta se puede cambiar a mano.
alter table public.matches add column desig_id text;              -- id de la designación en iSquad
alter table public.matches add column staff_checked timestamptz;  -- última lectura del equipo arbitral
alter table public.matches add column dieta_override numeric;     -- dieta puesta a mano (null = automática)
