-- Revisión del 2-nov-2026.
--
-- 1) Partidos: la web solo crea partidos a mano (id MAN-…) y, de cualquier partido, solo cambia lo que marca el árbitro
--    (peajes, dieta a mano, cobrado y "aún no ha llegado"). Antes podía insertar o reescribir cualquier fila suya con
--    cualquier fecha, pabellón o dirección, y así sacar de "compartir coche" la agenda de otros árbitros o gastar el cupo
--    de rutas de todos. Lo de iSquad solo lo escriben las funciones (service role, sin RLS).
drop policy if exists "partidos propios" on public.matches;
create policy "partidos propios: leer"   on public.matches for select to authenticated using (user_id = auth.uid());
create policy "partidos propios: borrar" on public.matches for delete to authenticated using (user_id = auth.uid());
create policy "partidos propios: editar" on public.matches for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "partidos a mano: crear"   on public.matches for insert to authenticated with check (user_id = auth.uid() and id like 'MAN-%');
revoke insert, update on public.matches from authenticated;
grant insert (user_id, id, comp, phase, teams, estado, date, time, venue, addr, venue_key, team, role) on public.matches to authenticated;
grant update (tolls, dieta_override, paid, not_received) on public.matches to authenticated;

-- 2) Tope de intentos de entrar (auth-isquad): sumar y comprobar en una sola operación. Antes leía, sumaba y escribía
--    por separado, y muchas peticiones a la vez pasaban todas el tope. La ventana empieza en el primer intento.
create function public.sumar_intento(k text, ventana_ms bigint, delta int) returns int language sql security definer set search_path = public as $$
  insert into public.pub_cache (key, data, fetched_at) values (k, jsonb_build_object('n', greatest(delta, 0)), now())
  on conflict (key) do update set
    data = jsonb_build_object('n', case when pub_cache.fetched_at > now() - make_interval(secs => ventana_ms / 1000.0)
                                        then greatest(coalesce((pub_cache.data->>'n')::int, 0) + delta, 0) else greatest(delta, 0) end),
    fetched_at = case when pub_cache.fetched_at > now() - make_interval(secs => ventana_ms / 1000.0) then pub_cache.fetched_at else now() end
  returning (data->>'n')::int
$$;
revoke all on function public.sumar_intento(text, bigint, int) from public, anon, authenticated;
