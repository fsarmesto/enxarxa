-- La FCVB retiene un 2 % de la tarifa por defecto: ese es el valor de partida; cada árbitro lo cambia si le toca otro.
alter table public.profiles alter column irpf set default 2;
update public.profiles set irpf = 2 where irpf = 0;
