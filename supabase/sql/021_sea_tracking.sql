-- Ship / container tracking from Safecube (Jose, 24 Oct 2026): the portal looks up
-- each new sea job's carrier BL (or one container) on Safecube and keeps the ETA,
-- the ship (IMO), its position and the latest move. Not ULIP. Filled by the
-- sea-track function. The free trial allows 50 shipments, so every number used
-- is counted in sea_track_usage and the function stops at its monthly cap.
create table if not exists public.sea_tracking (
  job_id         uuid primary key references public.jobs(id) on delete cascade,
  job_no         text,
  number         text not null,          -- the BL or container looked up
  number_type    text,                   -- 'BL' or 'CT'
  sealine        text,                   -- SCAC, e.g. EGLV
  sealine_name   text,
  status         text,                   -- PLANNED / IN_TRANSIT / DELIVERED / UNKNOWN
  pol            text,                   -- port of loading
  pol_date       timestamptz,
  pod            text,                   -- port of discharge
  pod_date       timestamptz,            -- ETA (or arrival when pod_actual)
  pod_actual     boolean,
  predictive_eta timestamptz,
  vessel_name    text,
  vessel_imo     text,
  vessel_mmsi    text,
  lat            double precision,
  lng            double precision,
  position_at    timestamptz,
  ais_status     text,
  last_event     jsonb,                  -- { what, where, when, box, vessel }
  containers     jsonb,                  -- [{ no, status, last }]
  track          jsonb,                  -- [[lat, lng, at]…] positions seen, for the map's track
  route          jsonb,                  -- { segments: [[[lat,lng]…]], pol: [lat,lng], pod: [lat,lng] } for the map
  warnings       text[],
  error          text,                   -- the last error, if the look-up failed
  done           boolean default false,  -- arrived / delivered: no more look-ups
  fetched_at     timestamptz,
  carrier_updated_at timestamptz,
  started_by     text,
  started_at     timestamptz default now()
);
alter table public.sea_tracking enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'sea_tracking' and policyname = 'staff read sea tracking') then
    create policy "staff read sea tracking" on public.sea_tracking for select to authenticated using (true);
  end if;
end $$;

-- every number sent to Safecube, once per month (Safecube bills a number once per month)
create table if not exists public.sea_track_usage (
  month    text not null,                -- '2026-10'
  number   text not null,
  job_no   text,
  added_at timestamptz default now(),
  primary key (month, number)
);
alter table public.sea_track_usage enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'sea_track_usage' and policyname = 'staff read sea usage') then
    create policy "staff read sea usage" on public.sea_track_usage for select to authenticated using (true);
  end if;
end $$;

-- every 3 hours, 7 am to 10 pm IST (password made by the database, never shown)
select cron.schedule('sea-track', '15 1-16/3 * * *', $$
  select net.http_post(
    url := 'https://lokiszscjahxabturzoo.supabase.co/functions/v1/sea-track',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bot-secret', (select cron_token from bot_state where id = 1)),
    body := '{}'::jsonb, timeout_milliseconds := 120000)
$$);

-- 25 Oct 2026: a failed hourly update keeps the last good data and is only noted here
alter table public.sea_tracking add column if not exists refresh_error text;
alter table public.sea_tracking add column if not exists refresh_error_at timestamptz;
