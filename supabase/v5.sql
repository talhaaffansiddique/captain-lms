-- Captain LMS — v5 database changes. Run ONCE in Supabase → SQL Editor → New query.
-- Safe to re-run (everything is "if not exists" / "or replace"). To undo, run v5-rollback.sql.
-- Features: HR role, audience colours, course assignments, certificates, milestone rules,
-- recognition badges, invitation log, monitoring & alerts, organisation leaderboard.

-- ---------- 0. helpers ----------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;
grant execute on function public.my_role() to authenticated;

-- ---------- 1. HR role (read-only portal) ----------
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('employee', 'admin', 'manager', 'hr'));

-- HR can read the same activity data as managers/admins (never write it).
drop policy if exists "hr read completions" on video_completions;
create policy "hr read completions" on video_completions for select using (public.my_role() = 'hr');
drop policy if exists "hr read quiz attempts" on quiz_attempts;
create policy "hr read quiz attempts" on quiz_attempts for select using (public.my_role() = 'hr');
drop policy if exists "hr read study logs" on study_log;
create policy "hr read study logs" on study_log for select using (public.my_role() = 'hr');

-- ---------- 2. audience colours ----------
alter table departments add column if not exists color text;
with numbered as (select id, row_number() over (order by id) as n from departments where color is null)
update departments d
set color = (array['#f08a24','#15803d','#8e44ad','#e42226','#0891b2','#d4a017','#db2777','#4b5563','#65a30d'])[1 + ((n - 1) % 9)::int]
from numbered where d.id = numbered.id;

-- ---------- 3. course assignments (incl. other departments) ----------
create table if not exists course_assignments (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  course_id bigint not null references courses (id) on delete cascade,
  due_date date,
  assigned_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, course_id)
);
alter table course_assignments enable row level security;
drop policy if exists "users read their assignments" on course_assignments;
create policy "users read their assignments" on course_assignments for select using (user_id = auth.uid());
drop policy if exists "staff read all assignments" on course_assignments;
create policy "staff read all assignments" on course_assignments for select using (public.my_role() in ('admin', 'manager', 'hr'));
drop policy if exists "admins manage assignments" on course_assignments;
create policy "admins manage assignments" on course_assignments for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ---------- 4. certificates ----------
create table if not exists certificate_settings (
  id int primary key default 1 check (id = 1),
  mode text not null default 'classic' check (mode in ('classic', 'custom')),
  org_name text not null default 'Captain & Company',
  signer_name text not null default '',
  signer_title text not null default '',
  template_url text, -- uploaded PDF template (public URL in module-materials)
  positions jsonb not null default '{"name":{"x":50,"y":44},"course":{"x":50,"y":55},"date":{"x":26,"y":80},"hours":{"x":74,"y":80},"cit":{"x":50,"y":66},"id":{"x":84,"y":8}}',
  updated_at timestamptz not null default now()
);
insert into certificate_settings (id) values (1) on conflict do nothing;
alter table certificate_settings enable row level security;
drop policy if exists "authenticated read certificate settings" on certificate_settings;
create policy "authenticated read certificate settings" on certificate_settings for select using (auth.role() = 'authenticated');
drop policy if exists "admins manage certificate settings" on certificate_settings;
create policy "admins manage certificate settings" on certificate_settings for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

create sequence if not exists certificate_number_seq;
create table if not exists issued_certificates (
  id bigint generated always as identity primary key,
  number text not null unique default ('CERT-' || lpad(nextval('certificate_number_seq')::text, 4, '0')),
  user_id uuid not null references profiles (id) on delete cascade,
  course_id bigint references courses (id) on delete set null,
  credit_hours numeric not null default 0,
  citation text not null default '',
  issued_by uuid references profiles (id) on delete set null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table issued_certificates enable row level security;
drop policy if exists "users read their certificates" on issued_certificates;
create policy "users read their certificates" on issued_certificates for select using (user_id = auth.uid());
drop policy if exists "staff read all certificates" on issued_certificates;
create policy "staff read all certificates" on issued_certificates for select using (public.my_role() in ('admin', 'manager', 'hr'));
drop policy if exists "admins manage certificates" on issued_certificates;
create policy "admins manage certificates" on issued_certificates for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ---------- 5. milestone rules and recognition badges ----------
create table if not exists milestone_rules (
  id bigint generated always as identity primary key,
  name text not null,
  icon text not null default '🏅',
  match_mode text not null default 'all' check (match_mode in ('all', 'any')),
  min_hours numeric,    -- completed course duration (hours); null = criterion not used
  min_courses int,      -- number of courses completed
  min_certs int,        -- number of certificates earned
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table milestone_rules enable row level security;
drop policy if exists "authenticated read milestone rules" on milestone_rules;
create policy "authenticated read milestone rules" on milestone_rules for select using (auth.role() = 'authenticated');
drop policy if exists "admins manage milestone rules" on milestone_rules;
create policy "admins manage milestone rules" on milestone_rules for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

create table if not exists recognition_badges (
  id bigint generated always as identity primary key,
  name text not null,
  icon text not null default '⭐',
  description text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists badge_awards (
  id bigint generated always as identity primary key,
  badge_id bigint not null references recognition_badges (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  citation text not null default '',
  awarded_by uuid references profiles (id) on delete set null,
  awarded_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table recognition_badges enable row level security;
alter table badge_awards enable row level security;
drop policy if exists "authenticated read recognition badges" on recognition_badges;
create policy "authenticated read recognition badges" on recognition_badges for select using (auth.role() = 'authenticated');
drop policy if exists "admins manage recognition badges" on recognition_badges;
create policy "admins manage recognition badges" on recognition_badges for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
drop policy if exists "users read their awards" on badge_awards;
create policy "users read their awards" on badge_awards for select using (user_id = auth.uid());
drop policy if exists "staff read all awards" on badge_awards;
create policy "staff read all awards" on badge_awards for select using (public.my_role() in ('admin', 'manager', 'hr'));
drop policy if exists "admins manage awards" on badge_awards;
create policy "admins manage awards" on badge_awards for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ---------- 6. bulk-invite tracking (CSV import) ----------
create table if not exists invite_rows (
  id bigint generated always as identity primary key,
  batch_id uuid not null,
  row_number int not null,
  full_name text not null,
  email text not null,
  department text not null default 'General',
  user_id uuid references profiles (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table invite_rows enable row level security;
drop policy if exists "admins read invite rows" on invite_rows;
create policy "admins read invite rows" on invite_rows for select using (public.my_role() = 'admin');

-- ---------- 7. monitoring & alerts ----------
create table if not exists monitoring_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  inactivity_days int not null default 14,
  deadline_days int not null default 3,
  cc_hr boolean not null default true,
  hr_email text not null default '',
  cc_manager boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into monitoring_settings (id) values (1) on conflict do nothing;
alter table monitoring_settings enable row level security;
drop policy if exists "admins manage monitoring settings" on monitoring_settings;
create policy "admins manage monitoring settings" on monitoring_settings for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
drop policy if exists "hr read monitoring settings" on monitoring_settings;
create policy "hr read monitoring settings" on monitoring_settings for select using (public.my_role() = 'hr');

create table if not exists alert_log (
  id bigint generated always as identity primary key,
  user_id uuid references profiles (id) on delete set null,
  to_email text not null,
  cc text,
  kind text not null check (kind in ('inactivity', 'deadline', 'overdue')),
  detail text not null default '',
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
alter table alert_log enable row level security;
drop policy if exists "staff read alert log" on alert_log;
create policy "staff read alert log" on alert_log for select using (public.my_role() in ('admin', 'hr'));

-- ---------- 8. organisation leaderboard (one scoring rule for all four routes) ----------
-- Per learner: badges earned (distinct milestone quizzes passed), courses completed (every
-- published lesson of the course done) and lessons completed — each counted inside the window.
-- p_days = null means all time. The app turns these counts into points (50 / 30 / 2).
create or replace function public.leaderboard_scores(p_days int default null)
returns table (user_id uuid, full_name text, department text, badges int, courses int, lessons int)
language sql stable security definer set search_path = public as $$
  with win as (select case when p_days is null then null else now() - make_interval(days => p_days) end as since),
  lessons as (
    select vc.user_id, count(*)::int as n
    from video_completions vc, win
    where vc.completed and (win.since is null or vc.completed_at >= win.since)
    group by vc.user_id
  ),
  badges as (
    select qa.user_id, count(distinct qa.milestone)::int as n
    from quiz_attempts qa, win
    where qa.passed and (win.since is null or qa.created_at >= win.since)
    group by qa.user_id
  ),
  course_done as (
    select vc.user_id, m.course_id, max(vc.completed_at) as finished_at,
           count(*) as done, (select count(*) from modules m2 where m2.course_id = m.course_id and m2.is_draft = false and m2.is_archived = false) as total
    from video_completions vc join modules m on m.id = vc.module_id
    where vc.completed and m.course_id is not null
    group by vc.user_id, m.course_id
  ),
  courses as (
    select cd.user_id, count(*)::int as n
    from course_done cd, win
    where cd.total > 0 and cd.done >= cd.total and (win.since is null or cd.finished_at >= win.since)
    group by cd.user_id
  )
  select p.id, p.full_name, p.department,
         coalesce(b.n, 0), coalesce(c.n, 0), coalesce(l.n, 0)
  from profiles p
  left join badges b on b.user_id = p.id
  left join courses c on c.user_id = p.id
  left join lessons l on l.user_id = p.id
  where p.is_active and p.role = 'employee'
$$;
grant execute on function public.leaderboard_scores(int) to authenticated;
