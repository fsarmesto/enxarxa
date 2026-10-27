-- Sección de Avisos de la web (issue #31): cada aviso que se manda (o que se mandaría si no tiene las notificaciones
-- activadas) queda en push_log con su texto, y cada usuario puede leer los suyos.
alter table public.push_log add column msg jsonb;   -- {title, body, tag, url} en el idioma del usuario
create policy "avisos propios: leer" on public.push_log for select to authenticated using (user_id = auth.uid());
grant select on public.push_log to authenticated;
create index push_log_user_sent on public.push_log (user_id, sent_at desc);
