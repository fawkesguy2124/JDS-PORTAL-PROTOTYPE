-- JNPA berthing reports (Jose, 7 Nov 2026): when each JDS ship is expected at, berths at and
-- sails from Nhava Sheva, read from the public daily reports on jnport.gov.in by the
-- port-berthing function. Free; not ULIP; no tracking service.
create table if not exists public.port_berthing (
  job_id        uuid primary key references public.jobs(id) on delete cascade,
  job_no        text,
  vessel        text,                  -- the ship looked for (ship tracking's, else the job's)
  status        text,                  -- not_listed / expected / berthed / sailed
  terminal      text,                  -- NSFT / NSICT / NSIGT / APMT / BMCT
  via           text,                  -- JNPA's call number, e.g. S2031
  eta           timestamptz,           -- the port's expected arrival
  berthed_at    timestamptz,
  sailed_at     timestamptz,
  eta_history   jsonb not null default '[]'::jsonb,   -- [{ eta, seen }]
  row_text      text,                  -- the report line it was read from
  report_url    text,
  first_seen_at timestamptz,
  seen_at       timestamptz,           -- last time a report listed it
  checked_at    timestamptz            -- last time the reports were read for it
);
alter table public.port_berthing enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'port_berthing' and policyname = 'staff read port berthing') then
    create policy "staff read port berthing" on public.port_berthing for select to authenticated using (true);
  end if;
end $$;

-- three times a day: 8:10, 13:10 and 19:10 India time (the reports come out in the morning)
select cron.schedule('port-berthing', '40 2,7,13 * * *', $$
  select net.http_post(
    url := 'https://lokiszscjahxabturzoo.supabase.co/functions/v1/port-berthing',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bot-secret', (select cron_token from bot_state where id = 1)),
    body := '{}'::jsonb, timeout_milliseconds := 120000)
$$);
