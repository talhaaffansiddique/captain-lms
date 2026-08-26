# Captain LMS

The real Vue 3 + TypeScript build of Captain LMS, following the click-through demo
(`captain-lms-demo.html`, published as a Claude Artifact) and its version history.

Stack — all free tier:

- **Frontend**: Vue 3 + TypeScript + Vite, hosted on **Netlify**
- **Backend + DB + Auth**: **Supabase** (Postgres, real email/password auth, auto REST API)
- **Scheduled jobs**: Netlify Scheduled Functions (`netlify/functions/`)
- **Email**: [Resend](https://resend.com) — free tier, verify `captainandcompany.com` for real sending
- **Video hosting**: YouTube (unlisted), unchanged from the demo

## What's wired up vs. what's a starting point

This scaffold has real, working auth + navigation + data reads/writes against Supabase for the
core screens (login/signup, dashboard, module list, marking a module watched, badges,
leaderboard, admin employee/module lists, manager team view). It does **not** yet include the
demo's more involved interactive logic — those are left as clearly-marked `TODO`s pointing back
at `captain-lms-demo.html` as the reference implementation:

- `src/views/employee/QuizView.vue` — the full timed quiz engine (one question at a time,
  3-minute timer, immediate feedback, 3-attempt cap, admin-grantable extra attempts)
- `src/views/employee/PlayerView.vue` — real YouTube watch-time tracking (currently a manual
  "mark as watched" button instead of the 95%-watched auto-detection)
- `src/views/admin/ModulesView.vue` — the Question Bank editor (manual rows + bulk paste, 10
  question minimum before publishing, draft/scheduled states)
- Notifications, theme toggle, announcements, captions, CSV import, compliance
  deadlines/escalation — all fully built in the demo, not yet ported here

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (free tier).
2. In the Supabase SQL Editor, run `supabase/schema.sql` from this repo — it creates every table,
   sets up Row Level Security, and auto-creates a `profiles` row whenever someone signs up.
3. Copy `.env.example` to `.env.local` and fill in your project's URL + anon key
   (Project Settings → API).
4. `npm install`
5. `npm run dev` — the login page should load with no red "Supabase not connected" banner once
   your `.env.local` is filled in correctly.
6. Sign up as an employee through the app. To create your first **admin** account, sign up
   normally, then in the Supabase Table Editor open `profiles` and change that row's `role` to
   `admin`. Same for `manager`, plus set their `department` to match the team they'll oversee.

## Deploying (all free)

1. Push this repo to GitHub.
2. In Netlify: **Add new site → Import an existing project**, connect your GitHub repo.
   Build command `npm run build`, publish directory `dist` (already set in `netlify.toml`).
3. In Netlify → Site settings → Environment variables, add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (same values as your `.env.local`).
4. Deploy. You'll get a free `*.netlify.app` URL immediately — good enough to demo to officials.
   Point `lms.captainandcompany.com` at it later via a DNS CNAME record once you're ready.
5. (Optional, later) Verify `captainandcompany.com` in Resend, add `RESEND_API_KEY` as a Netlify
   env var, and wire up `netlify/functions/weekly-digest.ts` for real scheduled emails.

## Project structure

```
src/
  lib/           Supabase client + hand-written DB types
  stores/        Pinia stores (auth)
  router/        routes + role-based guards
  components/layout/   sidebar shells per role (Employee / Admin / Manager)
  views/
    auth/        login/signup
    employee/    dashboard, modules, player, quiz, badges, leaderboard, account
    admin/       overview, employees, modules
    manager/     overview, team
supabase/
  schema.sql     full DB schema + RLS policies, run once in the Supabase SQL editor
netlify/
  functions/     scheduled functions (weekly digest, etc.)
```
