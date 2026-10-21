-- Edad mínima (14 años) y política aceptada: fecha y versión. Las cuentas anteriores quedan a null y la web les pide
-- la casilla la próxima vez que entren. Se acepta con aceptar_politica (la fecha la pone el servidor, no el navegador).
alter table public.profiles add column consent_at timestamptz, add column policy_version text;

create function public.aceptar_politica(v text) returns void language sql security definer set search_path = public as
$$ update public.profiles set consent_at = now(), policy_version = v where user_id = auth.uid() $$;
revoke all on function public.aceptar_politica(text) from public, anon;
grant execute on function public.aceptar_politica(text) to authenticated;
