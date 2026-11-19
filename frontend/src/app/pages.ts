import { lazyPage } from './lazyPage'

/** Every route is code-split. Keep this the single registry so nav links can preload. */
export const pages = {
  login: lazyPage(() => import('@/features/auth/LoginPage')),
  signup: lazyPage(() => import('@/features/auth/SignupPage')),
  forgotPassword: lazyPage(() => import('@/features/auth/ForgotPasswordPage')),
  resetPassword: lazyPage<{ mode: 'reset' | 'invite' }>(() => import('@/features/auth/ResetPasswordPage')),
  changePasswordRequired: lazyPage(() => import('@/features/auth/ChangePasswordRequiredPage')),

  dashboard: lazyPage(() => import('@/features/dashboard/DashboardPage')),
  attendance: lazyPage(() => import('@/features/attendance/AttendancePage')),
  leave: lazyPage(() => import('@/features/leave/LeavePage')),
  requests: lazyPage(() => import('@/features/regularization/RequestsPage')),
  news: lazyPage(() => import('@/features/news/NewsPage')),
  notifications: lazyPage(() => import('@/features/notifications/NotificationsPage')),
  employees: lazyPage(() => import('@/features/employees/EmployeesPage')),
  employeeProfile: lazyPage(() => import('@/features/employees/EmployeeProfilePage')),
  reports: lazyPage(() => import('@/features/reports/ReportsPage')),
  settings: lazyPage(() => import('@/features/settings/SettingsPage')),
  profile: lazyPage(() => import('@/features/auth/ProfilePage')),
  notFound: lazyPage(() => import('./NotFoundPage')),
}
