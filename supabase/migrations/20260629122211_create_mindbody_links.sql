create table if not exists mindbody_links (
  email text primary key,
  mindbody_client_id text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table mindbody_links enable row level security;
-- No RLS policies: accessed exclusively via service role key from the server.
-- All client-side access is blocked by default once RLS is enabled.
