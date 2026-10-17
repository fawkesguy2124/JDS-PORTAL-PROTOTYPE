-- Job fields used by the ULIP checks. Safe to run more than once.

-- Import or export job (decides which tabs a job shows)
alter table jobs add column if not exists job_type text not null default 'import';
do $$ begin
  alter table jobs add constraint jobs_job_type_check check (job_type in ('import', 'export'));
exception when duplicate_object then null; end $$;

-- Port / airport / ICD code, e.g. INNSA1 (JNPT), INBOM1 (Mumbai Port), INBOM4 (Mumbai air cargo)
alter table jobs add column if not exists port_code text;

-- Reference numbers remembered from ULIP checks, e.g.
-- { "sb_no": "1234567", "sb_date": "2026-10-03", "vcn_no": "...", "mawb_no": "..." }
alter table jobs add column if not exists ulip_refs jsonb not null default '{}'::jsonb;
