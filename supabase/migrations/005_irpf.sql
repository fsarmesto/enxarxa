-- Retención de IRPF que aplica cada árbitro (porcentaje sobre la tarifa; dietas, km y peajes van exentos).
alter table public.profiles add column irpf numeric not null default 0 check (irpf >= 0 and irpf <= 50);
grant update (irpf) on public.profiles to authenticated;
