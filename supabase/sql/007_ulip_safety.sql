-- Extra safety for ULIP traffic. Safe to run more than once.

-- Login lock and failure memory on the saved ULIP login
alter table ulip_token alter column token drop not null;
alter table ulip_token alter column expires_at drop not null;
alter table ulip_token add column if not exists issued_at timestamptz;
alter table ulip_token add column if not exists refreshing_until timestamptz;
alter table ulip_token add column if not exists last_login_failed_at timestamptz;
alter table ulip_token add column if not exists last_login_error text;
insert into ulip_token (id) values (1) on conflict (id) do nothing;

-- "This exact check is already running" markers (stops double clicks and
-- two people pressing the same button from making two ULIP calls)
create table if not exists ulip_inflight (
  key   text primary key,
  until timestamptz not null
);
alter table ulip_inflight enable row level security;   -- no policies: Edge Functions only

-- Faster "how many calls in the last minute" checks
create index if not exists ulip_calls_user_created_idx on ulip_calls (user_id, created_at desc);
create index if not exists ulip_calls_job_api_idx on ulip_calls (job_id, api, created_at desc);

-- customs_status: remember the last failure so repeat clicks wait
alter table customs_status add column if not exists last_error text;
alter table customs_status add column if not exists last_error_at timestamptz;
