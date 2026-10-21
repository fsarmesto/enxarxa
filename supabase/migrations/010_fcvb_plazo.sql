-- Recibos de iSquad: plazo para pedir el pago, qué deja hacer iSquad y si la tarifa se cobró en el pabellón.
alter table public.matches add column fcvb_limite date;      -- "Fin cambios" (el día siguiente al partido)
alter table public.matches add column fcvb_accion text;      -- editar | procesando | factura
alter table public.matches add column fcvb_campo boolean;    -- tarifa cobrada en el pabellón
