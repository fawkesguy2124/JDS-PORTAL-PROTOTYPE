-- Deleting a job failed: "violates foreign key constraint activity_log_job_id_fkey".
-- The job's history (activity_log) pointed to it with no rule for deletes.
-- Fix: when a job is deleted, keep its history rows (they still carry job_no,
-- e.g. "J-689") and just unlink them, like container_tracking and ulip_results.
-- Other links already handle deletes: documents, customs_status, be_drafts,
-- job_extractions are removed with the job; container_tracking, ulip_results unlinked.
-- 22 Oct 2026.
alter table public.activity_log drop constraint if exists activity_log_job_id_fkey;
alter table public.activity_log
  add constraint activity_log_job_id_fkey
  foreign key (job_id) references public.jobs(id) on delete set null;
