-- Aviso de la hora de salida hacia el pabellón (issue #73, función salida): se puede quitar en Ajustes → Notificaciones.
alter table public.profiles add column if not exists aviso_salida boolean not null default true;
grant update (aviso_salida) on public.profiles to authenticated;
