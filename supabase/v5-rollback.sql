-- Captain LMS — v5 ROLLBACK. Run in Supabase → SQL Editor to undo supabase/v5.sql completely.
-- WARNING: this deletes everything created with the v5 features (assignments, issued
-- certificates, rules, recognition badges and awards, invite and alert logs). Employees,
-- courses, modules and quiz data are NOT touched.
-- To undo only ONE feature, delete just that block (each block is labelled below).
-- Any HR users must be changed to another role first (step 1), or the role check will fail.

-- 1. HR role  (set HR users to 'manager' or 'employee' first)
update profiles set role = 'manager' where role = 'hr';
drop policy if exists "hr read completions" on video_completions;
drop policy if exists "hr read quiz attempts" on quiz_attempts;
drop policy if exists "hr read study logs" on study_log;
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('employee', 'admin', 'manager'));

-- 2. Audience colours
alter table departments drop column if exists color;

-- 3. Course assignments
drop table if exists course_assignments;

-- 4. Certificates
drop table if exists issued_certificates;
drop table if exists certificate_settings;
drop sequence if exists certificate_number_seq;

-- 5. Milestone rules and recognition badges
drop table if exists badge_awards;
drop table if exists recognition_badges;
drop table if exists milestone_rules;

-- 6. Bulk invite tracking
drop table if exists invite_rows;

-- 7. Monitoring & alerts
drop table if exists alert_log;
drop table if exists monitoring_settings;

-- 8. Leaderboard function
drop function if exists public.leaderboard_scores(int);

-- 0. Helper (only after everything above is removed)
drop function if exists public.my_role();
