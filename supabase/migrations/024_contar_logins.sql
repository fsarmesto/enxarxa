-- Contador de logins a iSquad por día, atómico (con varias ejecuciones de sync a la vez, leer y sumar perdía cuentas).
create function public.contar_login() returns void language sql security definer set search_path = public as $$
  insert into public.pub_cache (key, data, fetched_at) values ('logins:' || to_char(now() at time zone 'utc', 'YYYY-MM-DD'), '{"n":1}', now())
  on conflict (key) do update set data = jsonb_build_object('n', coalesce((pub_cache.data->>'n')::int, 0) + 1), fetched_at = now()
$$;
revoke all on function public.contar_login() from public, anon, authenticated;
