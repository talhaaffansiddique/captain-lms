import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useWidgetsStore } from '@/stores/widgets'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/login' },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/auth/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/app',
      component: () => import('@/components/layout/EmployeeLayout.vue'),
      meta: { role: 'employee' },
      children: [
        { path: '', redirect: '/app/dashboard' },
        {
          path: 'dashboard',
          name: 'employee-dashboard',
          component: () => import('@/views/employee/DashboardView.vue'),
        },
        {
          path: 'catalog',
          name: 'employee-catalog',
          component: () => import('@/views/employee/CatalogView.vue'),
        },
        {
          path: 'modules',
          name: 'employee-modules',
          component: () => import('@/views/employee/ModulesView.vue'),
        },
        {
          path: 'modules/:id',
          name: 'employee-player',
          component: () => import('@/views/employee/PlayerView.vue'),
        },
        {
          path: 'quiz/:milestone',
          name: 'employee-quiz',
          component: () => import('@/views/employee/QuizView.vue'),
        },
        {
          path: 'badges',
          name: 'employee-badges',
          meta: { widget: 'emp.certs' },
          component: () => import('@/views/employee/BadgesView.vue'),
        },
        {
          path: 'certificate/:milestone',
          name: 'employee-certificate',
          component: () => import('@/views/employee/CertificateView.vue'),
        },
        {
          path: 'calendar',
          name: 'employee-calendar',
          meta: { widget: 'emp.calendar' },
          component: () => import('@/views/employee/CalendarView.vue'),
        },
        {
          path: 'leaderboard',
          name: 'employee-leaderboard',
          meta: { widget: 'emp.leaderboard' },
          component: () => import('@/views/employee/LeaderboardView.vue'),
        },
        {
          path: 'account',
          name: 'employee-account',
          component: () => import('@/views/employee/AccountView.vue'),
        },
      ],
    },
    {
      path: '/admin',
      component: () => import('@/components/layout/AdminLayout.vue'),
      meta: { role: 'admin' },
      children: [
        { path: '', redirect: '/admin/overview' },
        {
          path: 'overview',
          name: 'admin-overview',
          component: () => import('@/views/admin/OverviewView.vue'),
        },
        {
          path: 'employees',
          name: 'admin-employees',
          component: () => import('@/views/admin/EmployeesView.vue'),
        },
        {
          path: 'employees/:id',
          name: 'admin-employee-detail',
          component: () => import('@/views/admin/EmployeeDetailView.vue'),
        },
        {
          path: 'courses',
          name: 'admin-courses',
          component: () => import('@/views/admin/CoursesView.vue'),
        },
        {
          path: 'courses/:id',
          name: 'admin-course-edit',
          component: () => import('@/views/admin/CourseEditView.vue'),
        },
        {
          path: 'audiences',
          name: 'admin-audiences',
          component: () => import('@/views/admin/AudiencesView.vue'),
        },
        {
          path: 'dashboard-settings',
          name: 'admin-dashboard-settings',
          component: () => import('@/views/admin/DashboardSettingsView.vue'),
        },
        {
          path: 'release-notes',
          name: 'admin-release-notes',
          component: () => import('@/views/admin/ReleaseNotesView.vue'),
        },
        {
          path: 'modules',
          name: 'admin-modules',
          component: () => import('@/views/admin/ModulesView.vue'),
        },
        {
          path: 'modules/:id',
          name: 'admin-module-edit',
          component: () => import('@/views/admin/ModuleEditView.vue'),
        },
      ],
    },
    {
      path: '/manager',
      component: () => import('@/components/layout/ManagerLayout.vue'),
      meta: { role: 'manager' },
      children: [
        { path: '', redirect: '/manager/overview' },
        {
          path: 'overview',
          name: 'manager-overview',
          component: () => import('@/views/manager/OverviewView.vue'),
        },
        {
          path: 'heatmap',
          name: 'manager-heatmap',
          meta: { widget: 'mgr.heatmap' },
          component: () => import('@/views/manager/HeatmapView.vue'),
        },
        {
          path: 'team',
          name: 'manager-team',
          component: () => import('@/views/manager/TeamView.vue'),
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  if (to.meta.public) return true

  const auth = useAuthStore()
  if (auth.loading) await auth.fetchProfile()

  if (!auth.isLoggedIn) return { name: 'login' }

  const requiredRole = to.meta.role as string | undefined
  if (requiredRole && auth.role !== requiredRole) {
    // Signed in, but this route belongs to a different role — send them home for their own role.
    if (auth.role === 'admin') return '/admin'
    if (auth.role === 'manager') return '/manager'
    return '/app'
  }
  // A page whose widget an admin has hidden is no longer reachable, even by typing its address.
  const widgetId = to.meta.widget as string | undefined
  if (widgetId) {
    const widgets = useWidgetsStore()
    if (!widgets.loaded) await widgets.load()
    if (!widgets.isVisible(widgetId)) return auth.role === 'manager' ? '/manager' : auth.role === 'admin' ? '/admin' : '/app'
  }
  return true
})

export default router
