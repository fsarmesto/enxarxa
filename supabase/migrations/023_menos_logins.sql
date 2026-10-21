-- Menos carga sobre iSquad (tarea 7, 21-oct-2026).
-- id de la ficha pública del árbitro (resultadosvoleibol.isquad.es/partidos_arbitro.php?id_arbitro=): vigilar la lee
-- sin login y solo entra en iSquad si ha cambiado.
alter table public.profiles add column id_arbitro text;
-- Sesión de iSquad de la última entrada (cookies, cifradas con CREDS_KEY): se reutiliza mientras iSquad la acepte.
alter table public.isquad_credentials add column session text, add column session_at timestamptz;
