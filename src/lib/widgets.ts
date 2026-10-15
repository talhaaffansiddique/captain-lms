export type WidgetRole = 'Employee' | 'Manager' | 'Admin'

export interface WidgetDef {
  id: string
  role: WidgetRole
  name: string
  description: string
  where: string
}

// Every dashboard widget has a stable id and is named after the role that sees it. Admins switch
// them on/off per role in Admin → Dashboard settings; the on/off state lives in dashboard_widgets.
export const WIDGETS: WidgetDef[] = [
  { id: 'emp.hero', role: 'Employee', name: 'Continue learning', description: 'Dashboard · top card with the resume button', where: 'Employee dashboard' },
  { id: 'emp.stats', role: 'Employee', name: 'Learning stats', description: 'Dashboard · in progress, completed, quiz score, streak', where: 'Employee dashboard' },
  { id: 'emp.courses', role: 'Employee', name: 'My courses', description: 'Dashboard · course list with progress', where: 'Employee dashboard' },
  { id: 'emp.due', role: 'Employee', name: 'Due this week', description: 'Dashboard · upcoming quizzes and deadlines', where: 'Employee dashboard' },
  { id: 'emp.activity', role: 'Employee', name: 'Recent activity', description: 'Dashboard · scores, completed lessons', where: 'Employee dashboard' },
  { id: 'emp.goal', role: 'Employee', name: 'Weekly goal & streak', description: 'Sidebar · hours studied against the weekly goal', where: 'Employee sidebar' },
  { id: 'emp.leaderboard', role: 'Employee', name: 'Leaderboard', description: 'Menu page · podium and ranking', where: 'Employee menu' },
  { id: 'emp.calendar', role: 'Employee', name: 'Deadline calendar', description: 'Menu page · month view of due dates', where: 'Employee menu' },
  { id: 'emp.certs', role: 'Employee', name: 'Certificates & badges', description: 'Menu page · achievements gallery', where: 'Employee menu' },
  { id: 'mgr.stats', role: 'Manager', name: 'Team summary tiles', description: 'Team progress · size, completion, at risk, overdue', where: 'Manager dashboard' },
  { id: 'mgr.table', role: 'Manager', name: 'Team progress table', description: 'Team progress · per-person bars and status', where: 'Manager dashboard' },
  { id: 'mgr.heatmap', role: 'Manager', name: 'Team heatmap', description: 'Menu page · people by course grid', where: 'Manager menu' },
  { id: 'adm.stats', role: 'Admin', name: 'Company stat tiles', description: 'Analytics · learners, completion, score, overdue', where: 'Admin analytics' },
  { id: 'adm.dept', role: 'Admin', name: 'Completion by department', description: 'Analytics · bars per department', where: 'Admin analytics' },
  { id: 'adm.funnel', role: 'Admin', name: 'Course funnel & drop-off', description: 'Analytics · compare courses or finish/pass rings (switchable)', where: 'Admin analytics' },
  { id: 'adm.heat', role: 'Admin', name: 'When people learn', description: 'Analytics · day-by-hour activity heatmap', where: 'Admin analytics' },
  { id: 'adm.compliance', role: 'Admin', name: 'Compliance tracker', description: 'Analytics · due soon and overdue by department', where: 'Admin analytics' },
  { id: 'adm.health', role: 'Admin', name: 'Content health', description: 'Analytics · unused, skipped and failed content', where: 'Admin analytics' },
]

export const WIDGET_BY_ID: Record<string, WidgetDef> = Object.fromEntries(WIDGETS.map((w) => [w.id, w]))
