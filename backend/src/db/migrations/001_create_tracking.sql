-- Create the tracking table for container shipment data
CREATE TABLE IF NOT EXISTS tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  container_no TEXT NOT NULL UNIQUE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  job_number TEXT,
  carrier TEXT NOT NULL DEFAULT 'Unknown',
  current_status TEXT NOT NULL DEFAULT 'unknown',
  current_location TEXT DEFAULT '',
  vessel TEXT DEFAULT '',
  voyage TEXT DEFAULT '',
  eta TIMESTAMPTZ,
  vessel_arrival TIMESTAMPTZ,
  port_in TIMESTAMPTZ,
  port_out TIMESTAMPTZ,
  cfs_gate_in TIMESTAMPTZ,
  last_update TIMESTAMPTZ,
  events JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracking_container_no ON tracking(container_no);
CREATE INDEX IF NOT EXISTS idx_tracking_job_id ON tracking(job_id);
CREATE INDEX IF NOT EXISTS idx_tracking_is_active ON tracking(is_active);
CREATE INDEX IF NOT EXISTS idx_tracking_updated_at ON tracking(updated_at DESC);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_tracking_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tracking_updated_at ON tracking;
CREATE TRIGGER trg_tracking_updated_at
  BEFORE UPDATE ON tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_tracking_timestamp();

-- Enable Row Level Security
ALTER TABLE tracking ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all rows
DROP POLICY IF EXISTS tracking_select_policy ON tracking;
CREATE POLICY tracking_select_policy ON tracking
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert
DROP POLICY IF EXISTS tracking_insert_policy ON tracking;
CREATE POLICY tracking_insert_policy ON tracking
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update
DROP POLICY IF EXISTS tracking_update_policy ON tracking;
CREATE POLICY tracking_update_policy ON tracking
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to delete (admin only via application logic)
DROP POLICY IF EXISTS tracking_delete_policy ON tracking;
CREATE POLICY tracking_delete_policy ON tracking
  FOR DELETE
  TO authenticated
  USING (true);
