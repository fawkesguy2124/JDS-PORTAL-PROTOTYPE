-- Several trucks per job (JDS, 19 Oct 2026): after OOC a big job can need more
-- than one truck. Each item: { no, container, dl, at, by }.
-- jobs.truck_no stays = the first truck, so older screens keep working.
-- Run 19 Oct 2026 in the Supabase SQL editor.
alter table public.jobs add column if not exists trucks jsonb not null default '[]'::jsonb;
