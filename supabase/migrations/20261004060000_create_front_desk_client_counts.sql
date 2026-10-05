-- Snapshot of every Mindbody client's class count for the staff front desk page.
-- Written only by the server with the service role key; RLS blocks anon access.
CREATE TABLE IF NOT EXISTS front_desk_client_counts (
  client_id text PRIMARY KEY,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  photo_url text NOT NULL DEFAULT '',
  completed_count integer NOT NULL DEFAULT 0,
  upcoming_count integer NOT NULL DEFAULT 0,
  next_milestone integer NOT NULL DEFAULT 5,
  classes_to_next_milestone integer NOT NULL DEFAULT 5,
  last_visit text NOT NULL DEFAULT '',
  -- Booked classes as [{ "classId": 123, "start": "2026-10-05T09:00:00", "classNumber": 25, "className": "..." }]
  upcoming_visits jsonb NOT NULL DEFAULT '[]'::jsonb,
  listed_at timestamptz NOT NULL DEFAULT now(),
  visits_synced_at timestamptz
);

CREATE INDEX IF NOT EXISTS front_desk_client_counts_sync_idx
  ON front_desk_client_counts (visits_synced_at NULLS FIRST);
CREATE INDEX IF NOT EXISTS front_desk_client_counts_completed_idx
  ON front_desk_client_counts (completed_count DESC);

ALTER TABLE front_desk_client_counts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS front_desk_sync_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  client_list_offset integer NOT NULL DEFAULT 0,
  client_list_started_at timestamptz,
  client_list_completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO front_desk_sync_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE front_desk_sync_state ENABLE ROW LEVEL SECURITY;
