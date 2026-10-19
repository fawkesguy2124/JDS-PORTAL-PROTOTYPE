-- WhatsApp bot: memory of what was sent, who wrote in, and the last alert check.
-- Safe to run more than once. Only the wa-bot Edge Function uses these tables.

-- Every summary/alert sent, once per key + person (so nothing repeats)
create table if not exists bot_sent (
  key           text not null,
  phone         text not null,
  kind          text,
  text          text,
  wa_message_id text,
  error         text,
  sent_at       timestamptz not null default now(),
  primary key (key, phone)
);
alter table bot_sent enable row level security;   -- no policies: Edge Functions only

-- When each team member last wrote to the bot (WhatsApp's 24-hour rule)
create table if not exists bot_inbox (
  phone           text primary key,
  last_inbound_at timestamptz
);
alter table bot_inbox enable row level security;

-- Up to when activity has been checked for alerts
create table if not exists bot_state (
  id                int primary key,
  alerts_checked_at timestamptz
);
alter table bot_state enable row level security;
insert into bot_state (id) values (1) on conflict (id) do nothing;

-- ── Schedule (run LATER, only when the bot is switched on) ──
-- Needs the pg_cron and pg_net extensions (Database → Extensions).
-- Replace <PROJECT> and <BOT_CRON_SECRET> before running.
--
-- select cron.schedule('wa-bot-morning', '30 3 * * *',  -- 9:00 IST = 3:30 UTC
--   $$ select net.http_post('https://<PROJECT>.supabase.co/functions/v1/wa-bot',
--        '{"run":"morning"}'::jsonb, '{}'::jsonb,
--        '{"Content-Type":"application/json","x-bot-secret":"<BOT_CRON_SECRET>"}'::jsonb) $$);
--
-- select cron.schedule('wa-bot-alerts', '*/15 2-15 * * *', -- every 15 min, 7:30–21:30 IST
--   $$ select net.http_post('https://<PROJECT>.supabase.co/functions/v1/wa-bot',
--        '{"run":"alerts"}'::jsonb, '{}'::jsonb,
--        '{"Content-Type":"application/json","x-bot-secret":"<BOT_CRON_SECRET>"}'::jsonb) $$);

-- ── What was actually run (19 Oct 2026) ──
-- The scheduler uses its own password made in the database (bot_state.cron_token),
-- so nobody pastes a secret. wa-bot accepts it (or the BOT_CRON_SECRET secret).
-- alter table public.bot_state add column if not exists cron_token text;
-- update public.bot_state set cron_token = md5(random()::text || clock_timestamp()::text) || md5(random()::text || clock_timestamp()::text) where id = 1 and cron_token is null;
-- select cron.schedule('wa-bot-morning', '30 3 * * *', $$ select net.http_post(url := '.../functions/v1/wa-bot',
--   body := '{"run":"morning"}'::jsonb, headers := jsonb_build_object('Content-Type','application/json',
--   'x-bot-secret', (select cron_token from public.bot_state where id = 1)), timeout_milliseconds := 60000) $$);
-- same for 'wa-bot-alerts', '*/15 2-15 * * *' with {"run":"alerts"}
-- To pause the bot:  select cron.unschedule('wa-bot-morning'); select cron.unschedule('wa-bot-alerts');
-- 19 Oct 2026: keep the bot warm and its data pre-loaded, every 5 min, 7:30 am - 9:15 pm IST
-- select cron.schedule('wa-bot-warm', '*/5 2-15 * * *', $$ select net.http_post(url := '.../functions/v1/wa-bot',
--   body := '{"run":"warm"}'::jsonb, headers := jsonb_build_object('Content-Type','application/json',
--   'x-bot-secret', (select cron_token from public.bot_state where id = 1)), timeout_milliseconds := 60000) $$);
-- 19 Oct 2026 (Jose): alerts and warm run 24 hours
-- select cron.alter_job(jobid, schedule := '*/15 * * * *') from cron.job where jobname = 'wa-bot-alerts';
-- select cron.alter_job(jobid, schedule := '*/5 * * * *') from cron.job where jobname = 'wa-bot-warm';
