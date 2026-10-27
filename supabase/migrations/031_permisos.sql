-- Revisión de seguridad (27-oct-2026): cada rol, solo con lo que usa. La protección por fila (RLS) ya bloqueaba lo
-- demás, pero los permisos de tabla venían de serie (incluido TRUNCATE, que RLS no frena). Las funciones usan
-- service_role y no les afecta.
-- - anon (sin sesión): nada en las tablas (entrar es la función auth-isquad).
-- - authenticated (la web con sesión): matches y venues (los suyos, por RLS), leer su perfil y cambiar las columnas de
--   ajustes, y leer sus avisos (push_log). Nada más.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select, insert, update, delete on public.matches to authenticated;
grant select, insert, update, delete on public.venues to authenticated;
grant select on public.profiles to authenticated;
grant update (origin, rate, min_travel, irpf, lang) on public.profiles to authenticated;
grant select on public.push_log to authenticated;
grant select on public.fav_teams to authenticated;
-- Las tablas nuevas no dan permisos a nadie por defecto: si la web necesita una, se le da a mano (y con su política).
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
