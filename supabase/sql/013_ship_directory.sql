-- Every ship the free AIS feed has heard (aisstream.io), filled by the
-- vessel-track function every 30 minutes. Background only: no screen reads it
-- (no policies, so only the server can). One row per ship, updated in place.
-- Run 22 Oct 2026.
create table if not exists public.ship_directory (
  mmsi        text primary key,
  name        text,
  name_key    text,
  imo         text,
  call_sign   text,
  ship_type   int,
  destination text,
  last_lat    double precision,
  last_lon    double precision,
  first_heard timestamptz default now(),
  last_heard  timestamptz
);
create index if not exists ship_directory_name_key on public.ship_directory (name_key);
alter table public.ship_directory enable row level security;
