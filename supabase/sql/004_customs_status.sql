-- Feature 1: customs status from the BE number (ULIP ICEGATE/03 + JNPT/02)
-- Safe to run more than once.

-- Truck number on the job (Shipment Tracker already writes this)
alter table jobs add column if not exists truck_no text;

-- Latest customs status per job. Written only by the customs-status Edge Function.
create table if not exists customs_status (
  job_id          uuid primary key references jobs(id) on delete cascade,
  job_no          text,
  be_no           text,
  be_date         date,
  ooc_no          text,
  ooc_date        date,
  igm_no          text,
  igm_date        date,
  do_no           text,
  do_date         date,
  vehicles        jsonb not null default '[]'::jsonb,
  icegate_status  text,   -- found / not_found / error
  jnpt_status     text,   -- found / not_found / error
  icegate_error   text,
  jnpt_error      text,
  raw             jsonb,  -- ULIP's original answers, for checking
  checked_at      timestamptz not null default now(),
  checked_by      uuid,
  checked_by_name text
);
alter table customs_status enable row level security;
drop policy if exists "Authenticated read customs_status" on customs_status;
create policy "Authenticated read customs_status"
  on customs_status for select to authenticated using (true);

-- Record of every ULIP call made by the portal
create table if not exists ulip_calls (
  id          bigint generated always as identity primary key,
  api         text not null,
  job_id      uuid,
  user_id     uuid,
  user_name   text,
  http_status integer,
  ok          boolean,
  error       text,
  ms          integer,
  created_at  timestamptz not null default now()
);
create index if not exists ulip_calls_created_at_idx on ulip_calls (created_at desc);
alter table ulip_calls enable row level security;
drop policy if exists "Authenticated read ulip_calls" on ulip_calls;
create policy "Authenticated read ulip_calls"
  on ulip_calls for select to authenticated using (true);

-- The one saved ULIP login (reused for 25 minutes). No policies: only the
-- Edge Functions (service role) can read or write it.
create table if not exists ulip_token (
  id         integer primary key default 1 check (id = 1),
  token      text not null,
  expires_at timestamptz not null
);
alter table ulip_token enable row level security;
