-- Acta electrónica en directo (3-nov-2026): el anotador (con su cuenta de la app) publica el marcador y quien tenga el enlace
-- lo sigue en docs/acta/directo/?id=<id>. Solo equipos, competición, marcador, sets y saque: NINGÚN nombre de jugador
-- (puede haber menores). El id es aleatorio (no se puede adivinar) y la lectura es pública; escribir, solo su anotador.
create table public.acta_directo (
  id          text primary key check (id ~ '^[a-z0-9]{16,40}$'),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  estado      jsonb not null check (pg_column_size(estado) < 20000),
  updated_at  timestamptz not null default now()
);
create index acta_directo_user on public.acta_directo (user_id);
alter table public.acta_directo enable row level security;
create policy "directo: lo ve quien tenga el enlace" on public.acta_directo for select to anon, authenticated using (true);
create policy "directo: lo crea su anotador" on public.acta_directo for insert to authenticated with check (user_id = auth.uid());
create policy "directo: lo actualiza su anotador" on public.acta_directo for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "directo: lo borra su anotador" on public.acta_directo for delete to authenticated using (user_id = auth.uid());
revoke all on public.acta_directo from anon, authenticated;
grant select on public.acta_directo to anon, authenticated;
grant insert, update, delete on public.acta_directo to authenticated;
-- Los directos de hace más de 2 días se borran solos (se llama al abrir un directo nuevo: no hace falta cron).
create function public.limpiar_directos() returns void language sql security definer set search_path = public as $$
  delete from public.acta_directo where updated_at < now() - interval '2 days'
$$;
revoke all on function public.limpiar_directos() from public, anon;
grant execute on function public.limpiar_directos() to authenticated;
