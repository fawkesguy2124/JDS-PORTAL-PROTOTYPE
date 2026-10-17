-- Saved answers for every ULIP check (one row per API + exact inputs).
-- Written only by the "ulip" Edge Function. Safe to run more than once.
create table if not exists ulip_results (
  query_key       text primary key,          -- e.g. 'ICEGATE/03?beDt=22032012&beNo=6330973'
  api             text not null,
  job_id          uuid references jobs(id) on delete set null,
  params          jsonb not null,
  found           boolean,
  summary         text,
  parsed          jsonb,                      -- what staff see (fields, tables)
  raw             jsonb,                      -- ULIP's original answer, for checking
  ok              boolean,
  last_error      text,
  last_error_at   timestamptz,
  checked_at      timestamptz,
  checked_by      uuid,
  checked_by_name text
);
create index if not exists ulip_results_job_idx on ulip_results (job_id, api, checked_at desc);
alter table ulip_results enable row level security;
drop policy if exists "Authenticated read ulip_results" on ulip_results;
create policy "Authenticated read ulip_results"
  on ulip_results for select to authenticated using (true);
