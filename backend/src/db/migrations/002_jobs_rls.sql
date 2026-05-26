-- Ensure RLS policies on the jobs table allow authenticated users to create jobs

-- Allow authenticated users to read all jobs
DROP POLICY IF EXISTS jobs_select_policy ON jobs;
CREATE POLICY jobs_select_policy ON jobs
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert jobs
DROP POLICY IF EXISTS jobs_insert_policy ON jobs;
CREATE POLICY jobs_insert_policy ON jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update jobs
DROP POLICY IF EXISTS jobs_update_policy ON jobs;
CREATE POLICY jobs_update_policy ON jobs
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to delete jobs
DROP POLICY IF EXISTS jobs_delete_policy ON jobs;
CREATE POLICY jobs_delete_policy ON jobs
  FOR DELETE
  TO authenticated
  USING (true);
