-- Última vez que se abrió la app (política de privacidad, 22-oct-2026): las cuentas sin usar 6 meses se borran, con
-- aviso 30 días antes (función inactivas). Las cuentas que ya existían empiezan a contar desde hoy.
alter table public.profiles add column last_active timestamptz not null default now();
create function public.marcar_actividad() returns void language sql security definer set search_path = public as
$$ update public.profiles set last_active = now() where user_id = auth.uid() $$;
revoke all on function public.marcar_actividad() from public, anon;
grant execute on function public.marcar_actividad() to authenticated;
