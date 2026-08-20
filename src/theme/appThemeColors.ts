/**
 * Single light blue theme.
 * “My” = bright azure · “Tuition” = navy · surfaces = light blue.
 */

export type AppThemeColors = {
  /** Navy — primary text, buttons, logo “Tuition”. */
  brandBlue: string;
  brandBlueDark: string;
  /** Royal blue — links, active chrome. */
  brandRoyal: string;
  brandRoyalSoft: string;
  /**
   * Logo “My” accent + interactive highlights (bright azure — not orange).
   * Kept as `brandOrange` key for call-site compatibility.
   */
  brandOrange: string;
  brandOrangeDark: string;
  brandOrangeSoft: string;
  /** Pale light-blue header / brand strip. */
  brandSurface: string;
  brandSurfaceGradient: readonly [string, string];
  text: string;
  textMuted: string;
  textSoft: string;
  border: string;
  page: string;
  surface: string;
  surfaceAlt: string;
  /** Selected row / chip wash (light blue). */
  selectionWash: string;
  /** Navigation chrome (tabs / sidebars). */
  chrome: string;
  statusBarStyle: 'dark' | 'light';
  /** Always light-background logos with this theme. */
  logoOn: 'light';
};

/** Fixed app colors — dark theme removed; orange accent removed. */
export const appThemeColors: AppThemeColors = {
  brandBlue: '#041830',
  brandBlueDark: '#00101F',
  brandRoyal: '#1E4FD6',
  brandRoyalSoft: '#3D6BA8',
  /** “My” accent */
  brandOrange: '#1E88E5',
  brandOrangeDark: '#1565C0',
  brandOrangeSoft: 'rgba(30, 136, 229, 0.12)',
  brandSurface: '#EEF4FF',
  brandSurfaceGradient: ['#E8F1FF', '#F5F8FC'],
  text: '#041830',
  textMuted: '#64748B',
  textSoft: '#465668',
  border: '#D6E2F0',
  page: '#F7FAFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F5FC',
  selectionWash: '#DBEAFE',
  chrome: '#EEF4FF',
  statusBarStyle: 'dark',
  logoOn: 'light',
};

/** Explicit alias — logo “My” wordmark color. */
export const brandMyAccent = appThemeColors.brandOrange;
/** Explicit alias — logo “Tuition” wordmark color. */
export const brandTuitionInk = appThemeColors.brandBlue;

/** @deprecated Use `appThemeColors` — dark theme removed. */
export const appThemeColorsLight = appThemeColors;

export function getAppThemeColors(): AppThemeColors {
  return appThemeColors;
}
