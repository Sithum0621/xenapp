/**
 * Shared brand + alert tokens for teacher, admin, auth, and signup flows.
 * Parent dashboard uses `parentDashboardPalette.ts` (toned variants of the same hues).
 */

export const appBrandBlue = '#123B7A';
export const appBrandBlueDark = '#0E2F63';
export const appTextMuted = '#64748B';
export const appBorder = '#E2E8F0';
export const appPageSurface = '#F8FAFC';
export const appSurface = '#FFFFFF';

/** Amber warning banners (temporary password, migration hints). */
export const appWarnBanner = {
  background: '#FEF7E6',
  border: '#F4D58D',
  text: '#7A4A00',
  accent: '#B45309',
  iconBackground: 'rgba(180, 83, 9, 0.12)',
} as const;

/** Softer info/warning surface (admin migration notices). */
export const appInfoBanner = {
  background: '#FFFBEB',
  border: '#FCD34D',
  text: '#92400E',
} as const;
