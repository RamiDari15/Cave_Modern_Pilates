-- Backend service role only. Customer identity is derived from a verified session.
create table public.account_deletion_requests (
  id uuid primary key,
  subject_key text not null,
  email text,
  client_id text,
  status text not null check (status in ('requested', 'confirmation_pending', 'completed')),
  requested_at timestamptz not null,
  due_at timestamptz not null,
  staff_notified_at timestamptz,
  completed_at timestamptz,
  erased_at timestamptz,
  evidence text,
  retained_records text,
  check (due_at >= requested_at),
  check (status <> 'completed' or completed_at is not null)
);
create unique index one_open_deletion_per_account on public.account_deletion_requests(subject_key) where status <> 'completed';
create index deletion_due on public.account_deletion_requests(due_at) where status <> 'completed';
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public, anon, authenticated;
grant select, insert, update on public.account_deletion_requests to service_role;
