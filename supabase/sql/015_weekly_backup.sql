-- Weekly backup (Jose, 22 Oct 2026): a PRIVATE storage bucket "backups" and a
-- Sunday 3:00 am IST schedule that calls the weekly-backup function. No
-- storage policies are added, so the portal cannot read it: only the server
-- and the Supabase dashboard (Storage → backups) can.
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do update set public = false;

-- every Sunday 3:00 am IST = Saturday 21:30 UTC (password made by the database, never shown)
select cron.schedule('weekly-backup', '30 21 * * 6', $$
  select net.http_post(
    url := 'https://lokiszscjahxabturzoo.supabase.co/functions/v1/weekly-backup',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bot-secret', (select cron_token from bot_state where id = 1)),
    body := '{}'::jsonb, timeout_milliseconds := 300000)
$$);
