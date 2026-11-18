-- Email log (v4.5). Run once in the Supabase SQL Editor.
-- Every email the app sends gets a row here, with its result and whether the recipient
-- clicked the "Open Captain LMS" button. Only the server (service-role key) writes to it;
-- admins can read it.

create table if not exists email_log (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  kind text not null default 'test',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  sent_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  clicked_at timestamptz,
  click_count int not null default 0
);

alter table email_log enable row level security;

drop policy if exists "admins read email log" on email_log;
create policy "admins read email log" on email_log
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
