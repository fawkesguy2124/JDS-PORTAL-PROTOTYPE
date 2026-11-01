-- 025 · The bot's questions to the team (Jose, 1 Nov 2026)
-- The bot asks only what the portal can't find out by itself (which truck took a container
-- that left the CFS, the BE of a ship that has arrived, whether a quiet job is delivered),
-- once, with at most one reminder, and remembers the answer here so it never asks again.
-- Only the bot (service role) reads or writes this table.

create table if not exists bot_questions (
  key            text primary key,            -- '<job id>:<kind>', e.g. '9f1…:truck'
  job_id         uuid,
  job_no         text,
  kind           text not null,               -- truck | be | delivered
  phone          text,                        -- who it was asked to
  question       text,
  msg_num        int,                         -- its number in the last question message
  asked_count    int not null default 0,
  first_asked_at timestamptz,
  last_asked_at  timestamptz,
  status         text not null default 'open', -- open | answered | skipped | resolved
  answer         text,
  answered_at    timestamptz
);
create index if not exists bot_questions_phone_idx on bot_questions (phone, status);
alter table bot_questions enable row level security;
-- (no policies: the portal's logins can't see it; the bot uses the service role)
