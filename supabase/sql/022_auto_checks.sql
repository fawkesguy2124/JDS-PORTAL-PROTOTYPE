-- Automatic checks (Jose, 25 Oct 2026: J-667's OOC of 24 Oct reached JDS only on 25 Oct;
-- every alert must reach JDS within about 1.5 hours). The auto-check function keeps one
-- row per thing to watch (a job waiting for OOC, a truck on the road, a truck's papers)
-- with when it is next due. Checks are spread out like a person working: random
-- intervals, one item at a time, 30-60 s apart, and a 2-hour pause after repeated errors.
create table if not exists public.auto_checks (
  key         text primary key,            -- 'ooc:<job id>', 'truck:<plate>', 'papers:<plate>', '__pause'
  kind        text not null,               -- ooc / truck / papers / pause
  job_id      uuid references public.jobs(id) on delete cascade,
  label       text,                        -- 'J-667', 'MH43CE9295 (J-639)'
  next_due    timestamptz not null default now(),
  last_run    timestamptz,
  last_result text,
  fails       int not null default 0,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists auto_checks_due on public.auto_checks (next_due);
alter table public.auto_checks enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'auto_checks' and policyname = 'staff read auto checks') then
    create policy "staff read auto checks" on public.auto_checks for select to authenticated using (true);
  end if;
end $$;

-- every 5 minutes, day and night; each run does at most a couple of checks
select cron.schedule('auto-check', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://lokiszscjahxabturzoo.supabase.co/functions/v1/auto-check',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bot-secret', (select cron_token from bot_state where id = 1)),
    body := '{}'::jsonb, timeout_milliseconds := 150000)
$$);

-- ship tracking (Safecube, not ULIP) every hour instead of every 3 hours
select cron.unschedule('sea-track');
select cron.schedule('sea-track', '15 * * * *', $$
  select net.http_post(
    url := 'https://lokiszscjahxabturzoo.supabase.co/functions/v1/sea-track',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bot-secret', (select cron_token from bot_state where id = 1)),
    body := '{}'::jsonb, timeout_milliseconds := 120000)
$$);
