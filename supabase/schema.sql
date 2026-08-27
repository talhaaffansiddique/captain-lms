-- Captain LMS — Supabase schema
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query) on a fresh project.
-- Auth (signup/login) is handled by Supabase's built-in `auth.users` table — this file only
-- adds the app-specific tables and links them to it via `profiles.id`.

-- ---------- profiles (one row per auth user) ----------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('employee', 'admin', 'manager')) default 'employee',
  department text not null default 'General',
  due_date date,
  created_at timestamptz not null default now()
);

-- ---------- modules (training videos) ----------
create table if not exists modules (
  id bigint generated always as identity primary key,
  title text not null,
  department text not null default 'General', -- 'General' = visible to everyone
  youtube_id text,
  duration_seconds int not null default 300,
  is_draft boolean not null default true,
  scheduled_date date,
  is_archived boolean not null default false,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ---------- quiz_questions (question bank, min 10 required to publish a module) ----------
create table if not exists quiz_questions (
  id bigint generated always as identity primary key,
  module_id bigint not null references modules (id) on delete cascade,
  question text not null,
  options jsonb not null, -- array of 4 strings
  correct_index int not null check (correct_index between 0 and 3),
  created_at timestamptz not null default now()
);

-- ---------- video_completions ----------
create table if not exists video_completions (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  module_id bigint not null references modules (id) on delete cascade,
  watched_seconds int not null default 0,
  completed boolean not null default false,
  completed_at timestamptz,
  unique (user_id, module_id)
);

-- ---------- quiz_attempts (every attempt at a milestone quiz) ----------
create table if not exists quiz_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  milestone text not null, -- '1'..'5' or 'final'
  attempt_number int not null,
  score int not null,
  total int not null,
  passed boolean not null,
  questions_snapshot jsonb, -- the randomly-drawn question set shown, for audit purposes
  created_at timestamptz not null default now()
);

-- ---------- quiz_attempt_grants (admin-granted extra attempts) ----------
create table if not exists quiz_attempt_grants (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  milestone text not null,
  extra_attempts int not null default 1,
  granted_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ---------- notifications ----------
create table if not exists notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  text text not null,
  action jsonb, -- e.g. {"type":"open-quiz","milestone":"3"} or {"type":"goto","view":"badges"}
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- announcements ----------
create table if not exists announcements (
  id bigint generated always as identity primary key,
  text text not null,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ---------- activity_log (admin audit trail) ----------
create table if not exists activity_log (
  id bigint generated always as identity primary key,
  actor_id uuid references profiles (id),
  text text not null,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Row Level Security — start locked down, then open exactly what's needed.
-- These are a reasonable starting point; review before going to production.
-- =========================================================================
alter table profiles enable row level security;
alter table modules enable row level security;
alter table quiz_questions enable row level security;
alter table video_completions enable row level security;
alter table quiz_attempts enable row level security;
alter table quiz_attempt_grants enable row level security;
alter table notifications enable row level security;
alter table announcements enable row level security;
alter table activity_log enable row level security;

-- profiles: everyone can read profiles (needed for leaderboard/team views); users can edit their
-- own profile, and admins can edit any profile (needed for setting due dates, roles, etc. from
-- the admin UI).
create policy "profiles are readable by any authenticated user" on profiles
  for select using (auth.role() = 'authenticated');
create policy "users can update their own profile" on profiles
  for update using (auth.uid() = id);
create policy "admins can update any profile" on profiles
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- modules: published, non-archived, non-scheduled-future modules are readable by everyone;
-- admins can do everything. (Simplified — tighten department scoping with a function if needed.)
create policy "employees see published modules" on modules
  for select using (
    is_draft = false
    and is_archived = false
    and (scheduled_date is null or scheduled_date <= current_date)
  );
create policy "admins manage modules" on modules
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- quiz_questions: admins manage the bank; any authenticated user can read it so the quiz engine
-- can draw a random subset client-side. (Trade-off: an employee could inspect the full bank via
-- devtools network requests. Fine for an internal corporate app — move the draw into a Supabase
-- Edge Function later if that needs locking down.)
create policy "admins manage quiz questions" on quiz_questions
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
create policy "authenticated users read quiz questions" on quiz_questions
  for select using (auth.role() = 'authenticated');

-- video_completions / quiz_attempts: users manage their own; admins/managers can read their team's
create policy "users manage their own video completions" on video_completions
  for all using (auth.uid() = user_id);
create policy "users manage their own quiz attempts" on quiz_attempts
  for all using (auth.uid() = user_id);
create policy "admins read all quiz attempts" on quiz_attempts
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager'))
  );

create policy "admins manage attempt grants" on quiz_attempt_grants
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
create policy "users read their own grants" on quiz_attempt_grants
  for select using (auth.uid() = user_id);

create policy "users manage their own notifications" on notifications
  for all using (auth.uid() = user_id);
create policy "admins send notifications to anyone" on notifications
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "everyone reads announcements" on announcements
  for select using (auth.role() = 'authenticated');
create policy "admins post announcements" on announcements
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "admins read activity log" on activity_log
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
create policy "admins write activity log" on activity_log
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- ---------- auto-create a profile row when someone signs up ----------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role, department)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'employee'),
    coalesce(new.raw_user_meta_data->>'department', 'General')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
