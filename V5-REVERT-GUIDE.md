# Captain LMS v5 — what changed and how to undo it

v4.5.1 is saved as the git tag **`v4.5.1-restore`**. v5.0 was built on the branch **`v5-build`**, with one commit per feature so any single feature can be reverted on its own.

## Undo EVERYTHING (back to v4.5.1)

```powershell
git checkout main
git reset --hard v4.5.1-restore   # only if v5 was already merged into main
git push --force-with-lease       # redeploys v4.5.1 on Netlify
```
If v5 was **not merged yet**, do nothing — `main` is still v4.5.1. Just don't merge `v5-build`.

Database: the v5 tables are all **new** and the old app ignores them, so leaving them is harmless. To remove them too, run `supabase/v5-rollback.sql` in the Supabase SQL Editor (each block is labelled by feature, so you can run just one block).

## Undo ONE feature

After merging, revert the feature's commit(s) with `git revert <hash>` (newest first if you revert several), then push. Then, if you want the data gone too, run that feature's block from `supabase/v5-rollback.sql`.

| # | Feature (your list) | Commit | Rollback SQL block |
|---|---|---|---|
| 1 | Foundation: database file + rollback file, **Audience colours** (4), **Course assignments** admin side (3) | `1542f0a` | blocks 2 and 3 |
| 2 | **Assigned courses** for employees: Dashboard, Catalog, My learning, Lesson player (10) | `3ba91d5` | block 3 |
| 3 | **Certificates** admin (1) and **Badges & milestone rules** admin (2) | `79595ad` | blocks 4 and 5 |
| 4 | Employee **Certificates & badges hub** (9) | `7c111f7` | — (reads blocks 4 and 5) |
| 5 | **KPI dashboards** (6) | `3940a57` | — (no tables) |
| 6 | **HR portal** (7) and **Organisation leaderboard** on all four routes (8, 11) | `927f10f` | blocks 1 and 8 |
| 7 | **Lesson video file upload** (6) | `bdb6b99` | — (no tables) |
| 8 | **Bulk invites via Resend + Retry failed invites** (5) | `92e9599` | block 6 |
| 9 | **Monitoring & alerts** (6) | `dc17bf7` | block 7 |
| 10 | Release notes + version v5.0 + this guide | last commit | — |

Notes:
- Reverting #1 (colours/assignments admin) on its own breaks #2 and #4, which build on it. Revert newest-first.
- Item 6 of your list has three parts: KPI dashboards (#5), Monitoring & alerts (#9) and lesson video upload (#7) — each is its own commit.
- Item 11 (employee leaderboard) shares one commit with items 7 and 8 (#6). Reverting that commit removes the HR portal and all four leaderboard routes; the employee leaderboard then goes back to the old version.

## What you must set up (one time)

1. **Supabase → SQL Editor → run `supabase/v5.sql`.** Until you do, the new pages show a yellow "One-time setup needed" note and nothing breaks.
2. **Resend (bulk invites):** in Netlify → Environment variables add `RESEND_API_KEY` and `RESEND_FROM` (for example `Captain Training <training@yourdomain.com>`; the domain must be verified in Resend), then redeploy.
3. **Alert and certificate emails** use the company mailbox you already set up (`SMTP_*`, `MAIL_FROM`). Nothing new needed.
4. **HR users:** Admin → Employees → open a person → Role → *HR (read-only)* → Save.
5. **Video uploads** use the existing `module-materials` storage bucket (Supabase free plan limit: 50 MB per file).
