/**
 * MyTuition brand palette — navy (“Tuition”) + azure (“My”) + light blue surfaces.
 * Parent dashboard uses toned variants in `parentDashboardPalette.ts`.
 */

/** Primary navy (logo “Tuition”, headings, primary buttons). */
export const appBrandBlue = '#041830';
/** Darker navy for pressed states / strong text. */
export const appBrandBlueDark = '#00101F';
/** Royal blue — links, active states. */
export const appBrandRoyal = '#1E4FD6';
export const appBrandRoyalSoft = '#3D6BA8';
/** Logo “My” accent — bright azure (replaces former orange). */
export const appBrandMy = '#1E88E5';
export const appBrandMyDark = '#1565C0';
export const appBrandMySoft = 'rgba(30, 136, 229, 0.12)';

/** @deprecated Use `appBrandMy` — orange removed from brand. */
export const appBrandOrange = appBrandMy;
/** @deprecated Use `appBrandMyDark`. */
export const appBrandOrangeDark = appBrandMyDark;
/** @deprecated Use `appBrandMySoft`. */
export const appBrandOrangeSoft = appBrandMySoft;

/** Soft selection / pressed wash (was orange tint). */
export const appBrandAccentWash = '#E3F2FD';

/** Pale light-blue header / brand strip (behind logos). */
export const appBrandSurface = '#EEF4FF';
export const appBrandSurfaceGradient = ['#E8F1FF', '#F5F8FC'] as const;

export const appTextMuted = '#64748B';
export const appBorder = '#D6E2F0';
export const appPageSurface = '#F7FAFF';
export const appSurface = '#FFFFFF';

/** Amber warning banners (temporary password, migration hints — not brand accent). */
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
