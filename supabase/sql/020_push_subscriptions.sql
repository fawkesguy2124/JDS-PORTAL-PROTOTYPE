-- Desktop notifications for the portal app (Jose, 24 Oct 2026).
-- One row per computer / browser that switched them on. `kinds` = which alerts
-- that person wants: ooc, container, free_days, be_not_filed (true / false).
-- The wa-bot alerts run (every 15 minutes) sends them; it reads this table with the
-- service key. People manage only their own rows.
create table if not exists push_subscriptions (
  endpoint    text primary key,                 -- the browser's push address
  user_id     uuid not null references auth.users(id) on delete cascade,
  user_name   text,
  p256dh      text not null,
  auth        text not null,
  kinds       jsonb not null default '{"ooc": true, "container": true, "free_days": true, "be_not_filed": true}',
  device      text,                             -- e.g. "Windows · Edge", to recognise it
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  failures    int not null default 0
);
alter table push_subscriptions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'push_subscriptions' and policyname = 'own push rows') then
    create policy "own push rows" on push_subscriptions
      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
