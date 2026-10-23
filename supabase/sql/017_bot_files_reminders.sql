-- WhatsApp bot (Jose, 24 Oct 2026):
-- 1. the last file a person sent the bot (kept until it is attached to a job)
-- 2. reminders the team sets by WhatsApp ("remind me tomorrow 10 am to …")
-- Server-only tables: row level security on, no policies (only the bot reads them).
alter table public.bot_inbox add column if not exists last_file jsonb;

create table if not exists public.bot_reminders (
  id          bigint generated always as identity primary key,
  phone       text not null,
  person_name text,
  job_no      text,
  text        text not null,
  due_at      timestamptz not null,
  sent_at     timestamptz,
  cancelled   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists bot_reminders_due_idx on public.bot_reminders (due_at) where sent_at is null and not cancelled;
alter table public.bot_reminders enable row level security;
