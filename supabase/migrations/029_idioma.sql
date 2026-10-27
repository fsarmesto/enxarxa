-- Idioma de la interfaz de cada usuario (issue #36), para mandarle los avisos push en su idioma. Lo pone la web al
-- entrar y al cambiar de idioma; sin dato, catalán (LANG_DEFECTO en _shared/textos.ts).
alter table public.profiles add column lang text check (lang in ('es', 'ca'));
grant update (lang) on public.profiles to authenticated;
