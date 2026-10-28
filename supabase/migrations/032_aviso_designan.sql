-- Aviso "Han empezado a designar" (una vez por semana, a todos los árbitros): se puede quitar en Ajustes → Notificaciones.
alter table public.profiles add column if not exists aviso_designan boolean not null default true;
grant update (aviso_designan) on public.profiles to authenticated;
