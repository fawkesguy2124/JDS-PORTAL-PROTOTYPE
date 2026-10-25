-- ETA history (Jose, 25 Oct 2026: show when a ship's ETA slips, like professional trackers).
-- first_pod_date: the first ETA the tracking gave; eta_history: [{ eta, seen }], one entry per change.
alter table public.sea_tracking add column if not exists first_pod_date timestamptz;
alter table public.sea_tracking add column if not exists eta_history jsonb not null default '[]'::jsonb;
-- ships tracked before today: today's ETA is the starting point
update public.sea_tracking
   set first_pod_date = pod_date,
       eta_history = jsonb_build_array(jsonb_build_object('eta', pod_date, 'seen', coalesce(started_at, fetched_at, now())))
 where first_pod_date is null and pod_date is not null;
