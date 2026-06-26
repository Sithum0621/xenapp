import type { ProfileRole } from '@/src/navigation/AppNavigator';

/** Only parent/student accounts use expiring temporary passwords (teacher-enrolled). */
export const TEMP_PASSWORD_ROLES: readonly ProfileRole[] = ['parent_student'];

export function roleUsesTempPassword(role: string | null | undefined): boolean {
  return role === 'parent_student';
}
