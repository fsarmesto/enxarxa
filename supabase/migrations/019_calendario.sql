-- Enlace secreto del calendario (iCal) de cada usuario: quien tenga el enlace ve sus partidos; se puede regenerar.
alter table public.profiles add column cal_token text unique;
