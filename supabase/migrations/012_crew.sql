-- Equipo arbitral de cada designación con nombres: [{f: "r1"|"r2"|"an"|"jl"|texto, n: nombre, me: es el propio}].
alter table public.matches add column crew jsonb;
