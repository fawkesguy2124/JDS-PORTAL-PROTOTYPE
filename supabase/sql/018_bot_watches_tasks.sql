-- WhatsApp bot (Jose, 24 Oct 2026):
-- 1. watchers: "tell me when J-652 gets OOC / this box leaves the CFS / this truck
--    crosses Panvel" — checked against saved portal data every 5 minutes
-- 2. tasks handed to a teammate ("ask Akshyani to file the BE for J-689 by 4 pm")
-- Server-only tables: row level security on, no policies.
create table if not exists public.bot_watches (
  id          bigint generated always as identity primary key,
  phone       text not null,
  person_name text,
  kind        text not null,           -- ooc | be_filed | arrived | container_out | container_event | truck_place | delivered
  job_id      uuid,
  job_no      text,
  target      text,                    -- container no, truck no
  place       text,                    -- e.g. PANVEL (truck_place)
  event       text,                    -- e.g. CFS OUT (container_event)
  created_at  timestamptz not null default now(),
  done_at     timestamptz,
  cancelled   boolean not null default false
);
create index if not exists bot_watches_open_idx on public.bot_watches (created_at) where done_at is null and not cancelled;
alter table public.bot_watches enable row level security;

create table if not exists public.bot_tasks (
  id          bigint generated always as identity primary key,
  from_phone  text not null,
  from_name   text,
  to_phone    text not null,
  to_name     text,
  job_id      uuid,
  job_no      text,
  text        text not null,
  due_at      timestamptz,
  status      text not null default 'open',   -- open | done | cancelled
  reminded_at timestamptz,
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);
create index if not exists bot_tasks_open_idx on public.bot_tasks (to_phone) where status = 'open';
alter table public.bot_tasks enable row level security;
