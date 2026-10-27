-- Resultado publicado y acta subida de cada partido arbitrado (issue #31), leídos de la web pública de resultados.
-- id_partido, eq_l y eq_v salen de la tabla de designaciones de iSquad; el resto lo rellena checkResultados (sync).
alter table public.matches
  add column id_partido  text,          -- partido en la web pública (el mismo id que la API de resultados)
  add column eq_l        text,          -- id_equipo local y visitante en la web pública
  add column eq_v        text,
  add column res_l       smallint,      -- sets del local y del visitante, cuando el resultado está publicado
  add column res_v       smallint,
  add column res_at      timestamptz,   -- cuando la app vio el resultado por primera vez
  add column acta_url    text,          -- PDF del acta escaneada (público)
  add column acta_at     timestamptz,   -- hora de subida del acta (del nombre del fichero) o cuando se vio
  add column pub_checked timestamptz;   -- última vez que se miró
