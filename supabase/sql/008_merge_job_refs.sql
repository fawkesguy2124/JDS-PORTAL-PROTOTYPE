-- Merge reference numbers into jobs.ulip_refs in one database step, so two
-- checks (or two tabs) can never wipe each other's numbers.
--   p_found: numbers ULIP returned — only fill gaps, never replace
--   p_typed: numbers a person typed — may correct an old value
--   p_truck: truck number to save only if the job has none yet
-- Runs with the caller's rights (normal table permissions apply).
-- Returns the updated job as a one-row set (empty if nothing was updated).
drop function if exists merge_job_refs(uuid, jsonb, jsonb, text);
create function merge_job_refs(p_job uuid, p_found jsonb, p_typed jsonb, p_truck text)
returns setof jobs
language sql
as $$
  update jobs
     set ulip_refs = (coalesce(p_found, '{}'::jsonb) || coalesce(ulip_refs, '{}'::jsonb)) || coalesce(p_typed, '{}'::jsonb),
         truck_no  = coalesce(nullif(truck_no, ''), nullif(p_truck, '')),
         updated_at = now()
   where id = p_job
  returning *;
$$;

revoke execute on function merge_job_refs(uuid, jsonb, jsonb, text) from public, anon;
grant execute on function merge_job_refs(uuid, jsonb, jsonb, text) to authenticated;
