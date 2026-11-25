-- Contact messages are accepted by the server API, not directly from browsers.
create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);
alter table public.contact_submissions enable row level security;
revoke all on public.contact_submissions from anon, authenticated;
grant select, insert on public.contact_submissions to service_role;
notify pgrst, 'reload schema';
