-- 7 Nov 2026 (Jose): the JNPA berthing check every hour, 8 am to 10 pm India time.
-- reports_seen: when each terminal's PDF was last changed, so an unchanged one is not downloaded again
alter table public.port_berthing add column if not exists reports_seen jsonb;
-- 8:10 am … 10:10 pm IST = 02:40 … 16:40 UTC
select cron.schedule('port-berthing', '40 2-16 * * *', $$
  select net.http_post(
    url := 'https://lokiszscjahxabturzoo.supabase.co/functions/v1/port-berthing',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bot-secret', (select cron_token from bot_state where id = 1)),
    body := '{}'::jsonb, timeout_milliseconds := 120000)
$$);
