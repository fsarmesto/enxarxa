-- Jugadores y entrenadores sin licencia de árbitro también pueden entrar (misma cuenta de iSquad para todo).
-- tipo = 'arbitro' (con designaciones y cobros) o 'deportista' (solo equipos; no se guarda su contraseña).
alter table public.profiles add column tipo text not null default 'arbitro';
