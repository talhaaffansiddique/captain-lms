-- Captain LMS — revamp (v4) database changes. Run once in Supabase → SQL Editor → New query.
-- Safe to re-run: every statement is "if not exists" / "or replace" / guarded.
-- The app keeps working before this is run (courses fall back to one-per-department groups,
-- widgets default to visible); the new features switch on as the pieces below appear.

-- ---------- courses (a course groups lessons = modules) ----------
create table if not exists courses (
  id bigint generated always as identity primary key,
  title text not null,
  category text not null default 'General',
  description text,
  color text not null default '#2f5be8',
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table modules add column if not exists course_id bigint references courses (id) on delete set null;
alter table modules add column if not exists lesson_order int not null default 0;

alter table courses enable row level security;
drop policy if exists "authenticated users read courses" on courses;
create policy "authenticated users read courses" on courses
  for select using (auth.role() = 'authenticated');
drop policy if exists "admins manage courses" on courses;
create policy "admins manage courses" on courses
  for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Group the existing modules into one starter course per audience (General + each department).
-- Admins can rename, recolour, split or merge these afterwards in Admin → Courses.
with audiences as (
  select department as name, row_number() over (order by department) as n from (select distinct department from modules) d
)
insert into courses (title, category, color)
select case when a.name = 'General' then 'Company-wide training' else a.name || ' training' end,
       a.name,
       (array['#2f5be8','#0f7f6c','#6d3fc0','#b4530f','#a3306b','#1d8348','#1f4e8c'])[1 + (a.n % 7)::int]
from audiences a
where not exists (select 1 from courses c where c.category = a.name);

update modules m
set course_id = c.id, lesson_order = case when m.lesson_order = 0 then m.id::int else m.lesson_order end
from courses c
where m.course_id is null and c.category = m.department;

-- ---------- study tracking (streak, weekly goal, "when people learn") ----------
alter table video_completions add column if not exists last_watched_at timestamptz;

create table if not exists study_log (
  user_id uuid not null references profiles (id) on delete cascade,
  day date not null,
  seconds int not null default 0,
  primary key (user_id, day)
);
alter table study_log enable row level security;
drop policy if exists "users read their own study log" on study_log;
create policy "users read their own study log" on study_log
  for select using (user_id = auth.uid());
drop policy if exists "admins and managers read study logs" on study_log;
create policy "admins and managers read study logs" on study_log
  for select using (exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager')));

-- Employees only ever add a few seconds to their own row for today.
create or replace function public.log_study_seconds(p_seconds int)
returns void as $$
begin
  if p_seconds > 0 and auth.uid() is not null then
    insert into study_log (user_id, day, seconds)
    values (auth.uid(), current_date, least(p_seconds, 120))
    on conflict (user_id, day) do update set seconds = study_log.seconds + least(p_seconds, 120);
  end if;
end;
$$ language plpgsql security definer;
grant execute on function public.log_study_seconds(int) to authenticated;

-- Admins and managers read everyone's activity for the analytics pages.
drop policy if exists "admins and managers read completions" on video_completions;
create policy "admins and managers read completions" on video_completions
  for select using (exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager')));
drop policy if exists "admins and managers read quiz attempts" on quiz_attempts;
create policy "admins and managers read quiz attempts" on quiz_attempts
  for select using (exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager')));

-- ---------- dashboard widget visibility (Admin → Dashboard settings) ----------
create table if not exists dashboard_widgets (
  widget_id text primary key,
  visible boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table dashboard_widgets enable row level security;
drop policy if exists "authenticated users read widget settings" on dashboard_widgets;
create policy "authenticated users read widget settings" on dashboard_widgets
  for select using (auth.role() = 'authenticated');
drop policy if exists "admins manage widget settings" on dashboard_widgets;
create policy "admins manage widget settings" on dashboard_widgets
  for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
