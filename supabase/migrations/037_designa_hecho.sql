-- Panel del designador (4-nov-2026): partidos que el designador ya ha pasado a iSquad (casilla "Pasado a iSquad").
-- Solo una marca suya por partido; se borra con el resto del fin de semana (4 semanas después, limpiar() en designa).
create table public.designa_hecho (
  finde       date not null,                                   -- el sábado del fin de semana
  match_key   text not null primary key,                       -- "AAAA-MM-DD HH:MM|LOCAL|VISITANTE" (normalizados)
  created_at  timestamptz not null default now()
);
create index designa_hecho_finde on public.designa_hecho (finde);
alter table public.designa_hecho enable row level security;
revoke all on public.designa_hecho from anon, authenticated;
