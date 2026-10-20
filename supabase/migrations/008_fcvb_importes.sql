-- Lo que la FCVB ha liquidado de cada partido (página de recibos de iSquad): manda sobre el cálculo de la app.
-- Gastos = desplazamiento + dieta juntos (iSquad no los separa en el listado). null = aún no está en recibos.
alter table public.matches add column fcvb_tarifa numeric;
alter table public.matches add column fcvb_gastos numeric;
alter table public.matches add column fcvb_pago text;      -- estado del pago en iSquad ("PAGADO - 14/10/2026", ...)
