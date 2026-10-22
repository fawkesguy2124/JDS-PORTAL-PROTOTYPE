-- Ships of open jobs, from aisstream.io (free live AIS). Filled by the
-- vessel-track function (every 30 min, and when the Vessels page is opened).
-- Not ULIP. 22 Oct 2026.
create table if not exists public.vessel_positions (
  name        text primary key,        -- ship name as on jobs / container tracking ("MSC AURORA")
  jobs        text[],                  -- open job numbers on this ship
  mmsi        text,                    -- the ship's radio id, kept once found
  imo         text,
  ship_name   text,
  lat         double precision,
  lon         double precision,
  sog         real,                    -- speed in knots
  cog         real,                    -- course
  heading     int,
  nav_status  int,                     -- 0 under way, 1 at anchor, 5 moored …
  destination text,                    -- as typed by the ship's crew
  eta_text    text,                    -- the ship's own ETA (UTC)
  ship_type   int,
  candidates  jsonb,                   -- other ships with the same name, if any
  seen_at     timestamptz,             -- time of the last position
  checked_at  timestamptz              -- time of the last listen
);
alter table public.vessel_positions enable row level security;
drop policy if exists "staff read ship positions" on public.vessel_positions;
create policy "staff read ship positions" on public.vessel_positions for select to authenticated using (true);

-- every 30 minutes (password made by the database, never shown)
select cron.schedule('vessel-track', '*/30 * * * *', $$
  select net.http_post(
    url := 'https://lokiszscjahxabturzoo.supabase.co/functions/v1/vessel-track',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bot-secret', (select cron_token from bot_state where id = 1)),
    body := '{}'::jsonb, timeout_milliseconds := 120000)
$$);
