// Hand-written types matching supabase/schema.sql.
// Once your Supabase project is live, regenerate this file with the real thing:
//   npx supabase gen types typescript --project-id <your-project-ref> > src/lib/database.types.ts

export type Role = 'employee' | 'admin' | 'manager'

export interface Profile {
  id: string
  full_name: string
  role: Role
  department: string
  due_date: string | null
  created_at: string
}

export interface Module {
  id: number
  title: string
  department: string
  youtube_id: string | null
  duration_seconds: number
  is_draft: boolean
  scheduled_date: string | null
  is_archived: boolean
  created_by: string | null
  created_at: string
}

export interface QuizQuestion {
  id: number
  module_id: number
  question: string
  options: string[]
  correct_index: number
  created_at: string
}

export interface VideoCompletion {
  id: number
  user_id: string
  module_id: number
  watched_seconds: number
  completed: boolean
  completed_at: string | null
}

export interface QuizAttempt {
  id: number
  user_id: string
  milestone: string
  attempt_number: number
  score: number
  total: number
  passed: boolean
  questions_snapshot: unknown
  created_at: string
}

export interface QuizAttemptGrant {
  id: number
  user_id: string
  milestone: string
  extra_attempts: number
  granted_by: string | null
  created_at: string
}

export interface Notification {
  id: number
  user_id: string
  text: string
  action: { type: 'open-quiz'; milestone: string } | { type: 'goto'; view: string } | null
  read: boolean
  created_at: string
}

export interface Announcement {
  id: number
  text: string
  created_by: string | null
  created_at: string
}

export interface ActivityLogEntry {
  id: number
  actor_id: string | null
  text: string
  created_at: string
}

// Minimal shape Supabase's client generic needs — table name -> Row type.
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> }
      modules: { Row: Module; Insert: Partial<Module>; Update: Partial<Module> }
      quiz_questions: {
        Row: QuizQuestion
        Insert: Partial<QuizQuestion>
        Update: Partial<QuizQuestion>
      }
      video_completions: {
        Row: VideoCompletion
        Insert: Partial<VideoCompletion>
        Update: Partial<VideoCompletion>
      }
      quiz_attempts: { Row: QuizAttempt; Insert: Partial<QuizAttempt>; Update: Partial<QuizAttempt> }
      quiz_attempt_grants: {
        Row: QuizAttemptGrant
        Insert: Partial<QuizAttemptGrant>
        Update: Partial<QuizAttemptGrant>
      }
      notifications: {
        Row: Notification
        Insert: Partial<Notification>
        Update: Partial<Notification>
      }
      announcements: {
        Row: Announcement
        Insert: Partial<Announcement>
        Update: Partial<Announcement>
      }
      activity_log: {
        Row: ActivityLogEntry
        Insert: Partial<ActivityLogEntry>
        Update: Partial<ActivityLogEntry>
      }
    }
  }
}
