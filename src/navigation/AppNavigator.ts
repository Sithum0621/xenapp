/**
 * Route paths for XEN. Keep in sync with files under app/.
 * Stack registration: app/_layout.tsx
 *
 * Cold-start branching (device-linked returning users vs onboarding): `src/navigation/appEntry.ts`.
 */

import type { Href } from 'expo-router';

export const AppRoutes = {
  language: '/language',
  tabs: '/(tabs)',
  welcome: '/welcome',
  roleSelect: '/role-select',
  login: '/login',
  superadminVerify: '/superadmin-verify',
  signup: '/signup',
  termsAndConditions: '/terms-and-conditions',
  policies: '/policies',
  policiesReturn: '/policies/return',
  policiesPrivacy: '/policies/privacy',
  policiesTerms: '/policies/terms',
  paymentPlan: '/payment-plan',
  adminDashboard: '/admin-dashboard',
  superAdminDashboard: '/super-admin-dashboard',
  teacherDashboard: '/teacher-dashboard',
  teacherIncomeBreakdown: '/teacher-dashboard/income-breakdown',
  teacherPayments: '/teacher-dashboard/payments',
  teacherCollectPayment: '/teacher-dashboard/collect-payment',
  teacherMyTimetable: '/teacher-dashboard/my-timetable',
  teacherWallet: '/teacher-dashboard/wallet',
  teacherClassCards: '/teacher-dashboard/class-cards',
  teacherDigitalPapers: '/teacher-dashboard/digital-papers',
  teacherLinkStudentCard: '/teacher-dashboard/link-student-card',
  teacherSmsCredit: '/teacher-dashboard/sms-credit',
  parentDashboard: '/parent-dashboard',
  auth: '/auth',
} as const;

export type AppRouteKey = keyof typeof AppRoutes;

/**
 * Roles shown on the public role selection screen.
 * `admin` opens login only (accounts are provisioned by superadmin).
 * Platform superadmin is not listed here and must use a separate secure entry point.
 */
export type PublicSelectableRole = 'teacher' | 'parent' | 'admin';

export type ProfileRole = 'superadmin' | 'admin' | 'teacher' | 'parent_student';

/** DB value for platform super admins. Subscription bypass also applies to `admin` and `teacher` — see `subscriptionChecksBypassForRole`. */
export const PROFILE_ROLE_SUPERADMIN = 'superadmin' as const satisfies ProfileRole;

export type AppRoutePath = (typeof AppRoutes)[keyof typeof AppRoutes];

/** Folder index paths like `/admin-dashboard` are valid at runtime but missing from generated Expo Router href unions. */
export function appHref(path: AppRoutePath | string): Href {
  return path as Href;
}

export function dashboardRouteForProfileRole(profileRole: ProfileRole): AppRoutePath {
  switch (profileRole) {
    case PROFILE_ROLE_SUPERADMIN:
      return AppRoutes.superAdminDashboard;
    case 'admin':
      return AppRoutes.adminDashboard;
    case 'teacher':
      return AppRoutes.teacherDashboard;
    case 'parent_student':
      return AppRoutes.parentDashboard;
  }
}

export const PUBLIC_SELECTABLE_ROLES: readonly PublicSelectableRole[] = ['teacher', 'parent', 'admin'] as const;

/** Full path for superadmin institute management (dynamic `[id]` segment). */
export function hrefSuperAdminInstituteManage(instituteId: string): string {
  return `/super-admin-institute/${instituteId}`;
}

/** Full path for superadmin institute teacher/student profiles roster. */
export function hrefSuperAdminInstituteProfiles(instituteId: string): string {
  return `/super-admin-institute-profiles/${instituteId}`;
}

/** Full path for superadmin games schedule event Q&A editor (dynamic `[eventId]` segment). */
export function hrefSuperAdminGamesScheduleEvent(eventId: string): string {
  return `/super-admin-games-schedule-event/${eventId}`;
}

/** Teacher digital MCQ paper editor (dynamic `[eventId]` segment). */
export function hrefTeacherDigitalPaperEvent(eventId: string): string {
  return `/teacher-dashboard/digital-papers/${eventId}`;
}

/** Full path for parent/student games schedule exam paper (dynamic `[eventId]` segment). */
export function hrefParentGamesScheduleEvent(studentUserId: string, eventId: string): string {
  const params = new URLSearchParams({ studentId: studentUserId });
  return `/parent-dashboard/games-event/${eventId}?${params.toString()}`;
}
