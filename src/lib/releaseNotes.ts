export interface ReleaseNote {
  version: string
  date: string // YYYY-MM-DD
  title: string
  changes: string[]
}

// Newest first. Add a new entry here whenever APP_VERSION is bumped in version.ts.
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: 'v4.1',
    date: '2026-10-15',
    title: 'Revamp phases 2-3: courses, catalog and course player',
    changes: [
      'New Course catalog with colourful course cards, category filters and search.',
      'Courses group lessons (modules); admins manage them in Admin → Courses, including colour, category, publishing and lesson order.',
      'New course player: lesson list with progress, previous/next lesson, and a practice quiz drawn from the course\'s question banks.',
      'Needs the one-time SQL in supabase/revamp-v4.sql; until it is run, one automatic course per audience is shown.',
    ],
  },
  {
    version: 'v4.0',
    date: '2026-10-15',
    title: 'Revamp phase 1: new design system',
    changes: [
      'New look across the whole app: navy sidebar, light content area, blue and orange accents, rounded cards and a new font.',
      'Dark mode kept and refreshed to match.',
      'Redesigned sign-in screen.',
    ],
  },
  {
    version: 'v3.1',
    date: '2026-10-15',
    title: 'Sortable tables',
    changes: [
      'Click any column heading to sort the Employees, admin Modules and employee My Modules tables; click again to reverse. Empty values always sort last.',
    ],
  },
  {
    version: 'v3.0',
    date: '2026-10-15',
    title: 'Release notes page',
    changes: ['New admin-only Release notes page listing every version with its date and what changed.'],
  },
  {
    version: 'v2.9',
    date: '2026-10-14',
    title: 'Avatar initials',
    changes: [
      'Avatar initials now come from the signed-in person’s real name in every sidebar and list (the admin sidebar was stuck on "PN").',
      'Editing your own name or role refreshes the sidebar straight away.',
    ],
  },
  {
    version: 'v2.8',
    date: '2026-10-14',
    title: 'Employee management',
    changes: [
      'Add a single employee (name, email, department, role) with an invite email.',
      'Edit an employee’s name and role from their page, which also shows their email and last sign-in.',
      'Deactivate / reactivate employees: they can’t sign in and are hidden from the leaderboard, team lists, overview counts and weekly digest, but their history is kept.',
      'Delete an employee permanently, with a confirmation. You can’t deactivate or delete yourself or the last active admin.',
      'Sign-ups can no longer claim an admin or manager role; roles are set by admins on the server.',
    ],
  },
  {
    version: 'v2.7',
    date: '2026-10-14',
    title: 'Delete and unpublish modules',
    changes: [
      'Admins can delete a module (with its questions, uploaded file and completion records) after a confirmation.',
      'Publish / Unpublish and Delete buttons added to every row of the module list.',
    ],
  },
  {
    version: 'v2.6',
    date: '2026-10-14',
    title: 'AI generator: faster model choice',
    changes: ['The question generator now starts with a light Gemini model and tries lighter, more settled models before the newest ones. Generation dropped from 20+ seconds to about 10.'],
  },
  {
    version: 'v2.5',
    date: '2026-10-14',
    title: 'AI generator: clearer failures',
    changes: ['Each model attempt is time-capped, and failures list which models were tried and why.'],
  },
  {
    version: 'v2.4',
    date: '2026-10-14',
    title: 'AI generator: model compatibility',
    changes: ['Requests fall back to simpler options when a Gemini model rejects the speed setting or strict output format, then try other models.'],
  },
  {
    version: 'v2.3',
    date: '2026-10-14',
    title: 'AI generator: overload handling and YouTube links',
    changes: [
      'Switches to another model when Gemini is overloaded, within a 24-second budget.',
      'YouTube links are accepted wherever a video ID is asked for, and are converted to the 11-character ID on save.',
    ],
  },
  {
    version: 'v2.2',
    date: '2026-10-14',
    title: 'AI generator: model auto-detection',
    changes: ['If the configured Gemini model is retired or unavailable, the generator finds a working Flash model automatically.'],
  },
  {
    version: 'v2.1',
    date: '2026-10-14',
    title: 'AI generator: real error messages',
    changes: ['Shows Google’s actual error, retries once on temporary overloads, and offers a paste-transcript box for videos that can’t be read.'],
  },
  {
    version: 'v2.0',
    date: '2026-10-14',
    title: 'AI question generator',
    changes: [
      'New "Generate questions from this material" card on each module: 15 questions (5 easy, 6 medium, 4 hard) drafted by Google Gemini’s free tier from the uploaded PDF, DOCX, PPTX or YouTube video.',
      'Review, edit or untick questions before adding them to the bank; add to or replace the existing questions.',
      'After creating a module with material, you’re offered to generate its questions straight away.',
    ],
  },
  {
    version: 'v1.9',
    date: '2026-08-28',
    title: 'Audiences page and employee module table',
    changes: [
      'Audiences (departments) moved to their own admin sidebar page.',
      'Employees’ My Modules is now a table (Title, Audience, Type, Duration, Status) with an All / General / your-department filter.',
    ],
  },
  {
    version: 'v1.8',
    date: '2026-08-28',
    title: 'Version tag placement',
    changes: ['The version tag moved next to Sign out so it never overlaps other content.'],
  },
  {
    version: 'v1.7',
    date: '2026-08-28',
    title: 'Tighter skip-blocking and type/duration columns',
    changes: ['Video skip-blocking reacts faster and allows less drift.', 'Type and duration are shown in every module list.'],
  },
  {
    version: 'v1.6',
    date: '2026-08-28',
    title: 'Document sizing and per-module quiz toggle',
    changes: ['The document viewer scales to the screen size.', 'Admins can choose whether a General module needs a quiz.'],
  },
  {
    version: 'v1.5',
    date: '2026-08-27',
    title: 'One quiz per General module',
    changes: [
      'Each General module gets its own quiz; department modules keep the quiz after every 5.',
      'Changing an employee’s department now clears their old training history (with a confirmation).',
    ],
  },
  {
    version: 'v1.4',
    date: '2026-08-27',
    title: 'Notifications',
    changes: ['Notifications moved to a sidebar row and open in a centered pop-up.'],
  },
  {
    version: 'v1.0 – v1.3',
    date: '2026-08-26',
    title: 'First release and foundations (26–27 Aug 2026)',
    changes: [
      'Employee, manager and admin sign-in with department-based module tracks, built on Vue, Supabase and Netlify.',
      'Visual design matched to the Captain LMS demo.',
      'Quiz engine with timed questions, attempt limits and cooldown; question bank editor with bulk paste.',
      'Badges, certificates, and a leaderboard with period and department filters.',
      'Real watch-time tracking with skip-blocking and a locked-down video player; documents (PDF, PPTX, DOCX) as an alternative to video.',
      'CSV employee import, scheduled publishing, compliance deadlines, announcements, captions toggle and the weekly digest.',
      'Editable audiences and a full module detail page; admins can grant extra quiz attempts.',
    ],
  },
]
