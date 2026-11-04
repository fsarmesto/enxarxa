-- Panel del designador (4-nov-2026): ubicación de un pabellón puesta a mano por el designador (botón "Ubicar"). Manda
-- sobre la automática y no caduca: vale para todos los fines de semana. La clave es el nombre sin "- PISTA n" (sinPista).
create table public.designa_pab (
  pab_key     text primary key,
  nombre      text not null,
  texto       text not null,              -- lo que escribió (dirección o población)
  lon         double precision not null,
  lat         double precision not null,
  updated_at  timestamptz not null default now()
);
alter table public.designa_pab enable row level security;
revoke all on public.designa_pab from anon, authenticated;
