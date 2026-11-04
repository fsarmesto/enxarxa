-- Acta electrónica: tablets de árbitros y entrenadores (4-nov-2026, encargo specs/acta-tablets-alineacion.md).
-- El anotador (con su cuenta de la app) comparte 3 enlaces privados: árbitros, entrenador local y entrenador visitante.
-- Las tablets NO tienen cuenta: se identifican solo con el token del enlace y solo pasan por las 2 funciones de abajo.
-- - Árbitros: ven el estado de la mesa (solo lectura) y las formaciones iniciales que envían los entrenadores en cuanto
--   llegan (decisión de Ferran, 4-nov: como en papel, el 2º árbitro recibe la hoja y la comprueba en pista).
-- - Entrenadores: ven el estado de la mesa y SOLO sus formaciones; envían la formación inicial de cada set una sola vez
--   (FIVB 7.3.2 y 5.2.3.1: la transmisión electrónica es oficial; 7.3.4: una vez entregada no se cambia).
-- El estado no lleva nombres de jugadores (solo dorsales: puede haber menores) ni la formación de un set sin empezar
-- (en el acta del anotador solo existe desde que empieza el set). Se borra a los 2 días, como acta_directo (036).

create table public.acta_mesa (
  id          text primary key check (id ~ '^[a-z0-9]{24,48}$'),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  -- Cada token empieza por la letra de su rol (a, l, v): así un mismo token no puede estar en 2 columnas (de la misma mesa o
  -- de otra) y nadie puede crear una mesa con el token de otra para que su enlace caiga en la suya.
  tok_arb     text not null unique check (tok_arb ~ '^a[a-z0-9]{23,47}$'),
  tok_entl    text not null unique check (tok_entl ~ '^l[a-z0-9]{23,47}$'),
  tok_entv    text not null unique check (tok_entv ~ '^v[a-z0-9]{23,47}$'),
  -- Lo publica el anotador tras cada suceso y cada 10 s (latido). `abierta` = el set que admite formaciones de las tablets
  -- (null con el set en juego o el partido acabado).
  estado      jsonb not null default '{}' check (pg_column_size(estado) < 30000),
  updated_at  timestamptz not null default now()
);
create index acta_mesa_user on public.acta_mesa (user_id);
-- La hora la pone el servidor (no el anotador): las tablets miden "sin datos desde hace X s" con el reloj del servidor.
create function public.acta_mesa_hora() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger acta_mesa_hora before insert or update on public.acta_mesa for each row execute function public.acta_mesa_hora();

-- Formaciones enviadas por los entrenadores: una por equipo y set, bloqueada al enviarla (FIVB 7.3.4).
create table public.acta_formacion (
  mesa_id     text not null references public.acta_mesa on delete cascade,
  eq          text not null check (eq in ('L', 'V')),
  set_n       int  not null check (set_n between 1 and 6),
  jugadores   text[] not null check (array_length(jugadores, 1) = 6),
  enviada_at  timestamptz not null default now(),
  cerrada     boolean not null default false,          -- el set ya ha empezado (lo marca el anotador)
  primary key (mesa_id, eq, set_n)
);

alter table public.acta_mesa enable row level security;
alter table public.acta_formacion enable row level security;
-- El anotador ve y escribe lo suyo; nadie más tiene acceso directo (anon, ninguno: solo las funciones).
create policy "mesa: la ve su anotador" on public.acta_mesa for select to authenticated using (user_id = auth.uid());
create policy "mesa: la crea su anotador" on public.acta_mesa for insert to authenticated with check (user_id = auth.uid());
create policy "mesa: la actualiza su anotador" on public.acta_mesa for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "mesa: la borra su anotador" on public.acta_mesa for delete to authenticated using (user_id = auth.uid());
create policy "formacion: la ve el anotador de la mesa" on public.acta_formacion for select to authenticated
  using (exists (select 1 from public.acta_mesa m where m.id = mesa_id and m.user_id = auth.uid()));
create policy "formacion: la cierra el anotador de la mesa" on public.acta_formacion for update to authenticated
  using (exists (select 1 from public.acta_mesa m where m.id = mesa_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.acta_mesa m where m.id = mesa_id and m.user_id = auth.uid()));
revoke all on public.acta_mesa, public.acta_formacion from anon, authenticated;
grant select, insert, update, delete on public.acta_mesa to authenticated;
grant select on public.acta_formacion to authenticated;
grant update (cerrada) on public.acta_formacion to authenticated;

-- Tablet: lo que ve según su enlace. null si el enlace no existe (o ya se ha revocado o borrado).
-- { rol: 'arbitro'|'entL'|'entV', estado, edad: segundos desde la última publicación (reloj del servidor),
--   formaciones: [{eq, set, jugadores, enviada, cerrada}] -> árbitros, las de los 2 equipos; entrenador, solo las suyas }
create function public.tablet_estado(tok text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'rol', r.rol,
    'estado', m.estado,
    'edad', round(extract(epoch from (now() - m.updated_at))::numeric, 1),
    'formaciones', coalesce((
      select jsonb_agg(jsonb_build_object('eq', f.eq, 'set', f.set_n, 'jugadores', to_jsonb(f.jugadores), 'enviada', f.enviada_at, 'cerrada', f.cerrada) order by f.set_n, f.eq)
      from public.acta_formacion f
      where f.mesa_id = m.id and (r.rol = 'arbitro' or f.eq = case r.rol when 'entL' then 'L' else 'V' end)), '[]'::jsonb))
  from public.acta_mesa m
  cross join lateral (select case when m.tok_arb = tok then 'arbitro' when m.tok_entl = tok then 'entL' else 'entV' end as rol) r
  where tok ~ '^[a-z0-9]{24,48}$' and (m.tok_arb = tok or m.tok_entl = tok or m.tok_entv = tok)
$$;

-- Entrenador: envía la formación inicial del set n (6 dorsales en las posiciones I..VI). Comprueba el formato, que no se
-- repitan, que el anotador tenga ese set abierto a formaciones y que no se haya enviado ya (queda bloqueada). La validación
-- completa (inscritos, no líbero, no descalificados) la hace el motor del acta cuando el anotador decide usarla.
-- Devuelve {ok, enviada} o {error: 'enlace' | 'no valida' | 'set empezado' | 'ya enviada'}.
create function public.tablet_enviar_formacion(tok text, n int, dorsales text[]) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.acta_mesa;
  e text;
  abierta text;
  t timestamptz;
begin
  if tok is null or tok !~ '^[a-z0-9]{24,48}$' then return jsonb_build_object('error', 'enlace'); end if;
  select * into m from public.acta_mesa where tok_entl = tok or tok_entv = tok;
  if not found then return jsonb_build_object('error', 'enlace'); end if;
  e := case when m.tok_entl = tok then 'L' else 'V' end;
  if dorsales is null or array_ndims(dorsales) <> 1 or array_length(dorsales, 1) <> 6
     or exists (select 1 from unnest(dorsales) d where d is null or d !~ '^(00|0|[1-9][0-9]?)$')
     or (select count(distinct d) from unnest(dorsales) d) <> 6 then
    return jsonb_build_object('error', 'no valida');
  end if;
  abierta := m.estado->>'abierta';
  if n is null or abierta is null or abierta !~ '^[1-6]$' or abierta::int <> n then return jsonb_build_object('error', 'set empezado'); end if;
  insert into public.acta_formacion (mesa_id, eq, set_n, jugadores) values (m.id, e, n, dorsales)
    on conflict (mesa_id, eq, set_n) do nothing returning enviada_at into t;
  if t is null then return jsonb_build_object('error', 'ya enviada'); end if;
  return jsonb_build_object('ok', true, 'enviada', t);
end $$;

-- Las mesas de hace más de 2 días se borran solas (se llama al compartir una nueva, como limpiar_directos: sin cron).
create function public.limpiar_mesas() returns void language sql security definer set search_path = public as $$
  delete from public.acta_mesa where updated_at < now() - interval '2 days'
$$;

revoke all on function public.tablet_estado(text), public.tablet_enviar_formacion(text, int, text[]), public.limpiar_mesas(), public.acta_mesa_hora() from public, anon, authenticated;
grant execute on function public.tablet_estado(text), public.tablet_enviar_formacion(text, int, text[]) to anon, authenticated;
grant execute on function public.limpiar_mesas() to authenticated;
