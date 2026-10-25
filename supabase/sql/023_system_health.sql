-- System health (Jose, 25 Oct 2026): one call that tells the portal whether every
-- background service is running: the schedules, the automatic ULIP checks, ship and
-- container tracking, WhatsApp and the desktop alerts. Read-only; signed-in staff only.
create or replace function public.system_health() returns jsonb
language plpgsql security definer set search_path = public, cron as $$
declare r jsonb;
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'not allowed';
  end if;
  select jsonb_build_object(
    'now', now(),
    'cron', (select coalesce(jsonb_agg(jsonb_build_object('name', j.jobname, 'schedule', j.schedule, 'active', j.active,
        'last_start', d.start_time, 'last_status', d.status, 'last_message', left(d.return_message, 160)) order by j.jobname), '[]'::jsonb)
      from cron.job j left join lateral (select x.start_time, x.status, x.return_message from cron.job_run_details x where x.jobid = j.jobid order by x.start_time desc limit 1) d on true),
    'auto', (select jsonb_build_object(
        'watching', count(*) filter (where key <> '__pause'),
        'last_run', max(last_run) filter (where key <> '__pause'),
        'failing', count(*) filter (where fails > 0 and key <> '__pause'),
        'next_due', min(next_due) filter (where key <> '__pause'),
        'paused_until', max(next_due) filter (where key = '__pause' and next_due > now()),
        'by_kind', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (select kind, count(*) n from auto_checks where key <> '__pause' group by kind) k))
      from auto_checks),
    'auto_recent', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object('kind', kind, 'label', label, 'last_run', last_run, 'result', last_result, 'fails', fails, 'next_due', next_due) x
        from auto_checks where key <> '__pause' and last_run is not null order by last_run desc limit 12) t),
    'ships', (select jsonb_build_object('tracked', count(*), 'errors', count(*) filter (where error is not null),
        'refresh_errors', count(*) filter (where refresh_error is not null), 'last_update', max(fetched_at))
      from sea_tracking where not coalesce(done, false)),
    'safecube_used', (select count(*) from sea_track_usage where month = to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM')),
    'containers', (select jsonb_build_object('tracked', count(*), 'last_refresh', max(last_refreshed_at)) from container_tracking),
    'ulip_24h', (select coalesce(jsonb_object_agg(api, jsonb_build_object('ok', ok_n, 'failed', bad_n, 'last', last_at)), '{}'::jsonb) from (
        select api, count(*) filter (where checked_at > now() - interval '24 hours') ok_n,
               count(*) filter (where last_error_at > now() - interval '24 hours') bad_n,
               greatest(max(checked_at), max(last_error_at)) last_at
        from ulip_results where greatest(checked_at, last_error_at) > now() - interval '24 hours' group by api) u),
    'whatsapp_24h', (select jsonb_build_object(
        'sent', count(*) filter (where error is null and phone not like 'push:%' and kind <> 'inbound'),
        'held', count(*) filter (where error like 'held%' and error not like '%sent together%'),
        'failed', count(*) filter (where error is not null and error not like 'held%' and phone not like 'push:%'),
        'desktop', count(*) filter (where phone like 'push:%' and error is null),
        'last_sent', max(sent_at) filter (where (error is null or error like '%sent together%') and kind <> 'inbound' and phone not like 'push:%'),
        'last_inbound', max(sent_at) filter (where kind = 'inbound'))
      from bot_sent where sent_at > now() - interval '24 hours'),
    'last_summary', (select max(sent_at) from bot_sent where kind = 'morning'),
    'desktop_computers', (select count(*) from push_subscriptions)
  ) into r;
  return r;
end $$;
revoke all on function public.system_health() from public;
grant execute on function public.system_health() to authenticated;
