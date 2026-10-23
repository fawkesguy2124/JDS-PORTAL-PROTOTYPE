-- WhatsApp bot: who may use it, and what they may do (Jose, 24 Oct 2026).
-- Jose's two numbers are admins in the code (botMessages.js BOT_PEOPLE) and can't
-- be changed here. More numbers are added by an admin from WhatsApp
-- ("give 98xxxxxxxx view only"), after a Yes.
--   view  = ask, summaries and alerts only
--   staff = view + everyday changes (after Yes), checks, files, watches, reminders
--   admin = everything (new jobs, CFS payments, tasks, reports, access)
create table if not exists bot_people (
  phone      text primary key,          -- 91 + 10-digit mobile
  name       text not null,
  level      text not null check (level in ('view', 'staff', 'admin')),
  added_by   text,
  added_at   timestamptz not null default now()
);
alter table bot_people enable row level security;   -- no policies: Edge Functions only
