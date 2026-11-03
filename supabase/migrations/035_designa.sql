-- Designaciones del fin de semana (3-nov-2026): los árbitros dan su disponibilidad (con cuenta de la app o a mano) y el
-- designador (Albert, login propio en el secret DESIGNA_USERS) reparte los partidos en /designa-admin/. Solo un plan:
-- nada se escribe en iSquad. Todo pasa por la función designa (service role): sin acceso directo desde la web.
create table public.designa_disp (
  id          uuid primary key default gen_random_uuid(),
  finde       date not null,                                   -- el sábado del fin de semana
  user_id     uuid references public.profiles(user_id) on delete cascade,   -- null = rellenado a mano, sin cuenta
  edit_hash   text,                                            -- sin cuenta: huella del código para cambiarla o retirarla
  nombre      text not null check (length(nombre) between 3 and 80),
  poblacion   text not null check (length(poblacion) between 2 and 80),
  lon         double precision,
  lat         double precision,
  coche       boolean not null,
  sab         text not null check (sab in ('no','manana','tarde','ambas')),
  sab_obs     text not null default '' check (length(sab_obs) <= 300),
  dom         text not null check (dom in ('no','manana','tarde','ambas')),
  dom_obs     text not null default '' check (length(dom_obs) <= 300),
  origen      text not null default 'form' check (origen in ('form','designador')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index designa_disp_user on public.designa_disp (finde, user_id) where user_id is not null;
create index designa_disp_finde on public.designa_disp (finde);

-- Plan del designador: un árbitro (de los que han dado disponibilidad) por partido y puesto.
create table public.designa_asig (
  finde       date not null,
  match_key   text not null,                                   -- "AAAA-MM-DD HH:MM|LOCAL|VISITANTE" (normalizados)
  rol         text not null check (rol in ('r1','r2','an')),
  disp_id     uuid not null references public.designa_disp(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (match_key, rol)
);
create index designa_asig_finde on public.designa_asig (finde);

alter table public.designa_disp enable row level security;
alter table public.designa_asig enable row level security;
revoke all on public.designa_disp, public.designa_asig from anon, authenticated;
