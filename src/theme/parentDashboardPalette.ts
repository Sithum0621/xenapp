/**
 * Parent dashboard colors — original brand hues, slightly desaturated
 * so the UI stays recognizable without feeling loud.
 */

/** Primary text (softened navy). */
export const parentInk = '#1A3D6B';
/** Secondary text on white panels — darkened for WCAG AA contrast on light backgrounds. */
export const parentInkSoft = '#465668';
export const parentInkMuted = '#5A6578';
export const parentBorder = '#E2E8F0';
export const parentSurface = '#FFFFFF';
export const parentSurfaceAlt = '#F4F6FA';

/** Brand blue — toned from #123B7A / #0E2F63. */
export const parentBrandBlue = '#2E5494';
export const parentBrandBlueDark = '#1A3D6B';

/** Greeting name accent — toned purple from #5B3A8A. */
export const parentGreetingAccent = '#6B5289';

export const parentPresent = '#3A9A6E';
export const parentAbsent = '#C45656';
export const parentTrack = '#E4EBF2';

/** Student tab selection — soft blue wash (was #D8E5FF / #EEF4FF). */
export const parentTabActiveStart = '#D4E3F8';
export const parentTabActiveEnd = '#EBF2FC';

/** Today's schedule time strip — soft green (was #DFF3C8). */
export const parentScheduleTimeBg = '#E4F0D8';

export const parentGamesGold = '#B8882E';
export const parentGamesPurple = '#8B6FC4';

/** XEN brand — teal/cyan family (Attendance + Exams). */
export const parentTealBrand = '#2A9D8F';
export const parentTealBrandLight = '#56C4B8';
export const parentTealCyanGradient = [parentTealBrand, parentTealBrandLight] as const;
export const parentTealTileGlow = 'rgba(42, 157, 143, 0.38)';

/** XEN brand — purple / neon-pink family (Games + Wallet). */
export const parentPurpleBrand = '#7B6BC4';
export const parentPurpleBrandLight = '#B57ED8';
export const parentPurpleBlueGradient = ['#5B4B8A', parentPurpleBrand] as const;
export const parentPurpleTileGlow = 'rgba(181, 126, 216, 0.42)';

/** @deprecated Use parentTealTileGlow / parentPurpleTileGlow for interactive shadows. */
export const parentTealCyanGlow = 'rgba(255, 255, 255, 0.2)';
/** @deprecated Use parentPurpleTileGlow for interactive shadows. */
export const parentPurpleBlueGlow = 'rgba(255, 255, 255, 0.2)';

export const parentTileGradients = {
  attendance: parentTealCyanGradient,
  exams: parentTealCyanGradient,
  games: parentPurpleBlueGradient,
  wallet: parentPurpleBlueGradient,
};

export const parentTileGlows = {
  games: parentPurpleTileGlow,
  exams: parentTealTileGlow,
  wallet: parentPurpleTileGlow,
  attendance: parentTealTileGlow,
} as const;

export type ParentTileAccentFamily = 'teal' | 'purple';

export const parentTileAccentFamily: Record<
  'attendance' | 'exams' | 'games' | 'wallet',
  ParentTileAccentFamily
> = {
  attendance: 'teal',
  exams: 'teal',
  games: 'purple',
  wallet: 'purple',
};

export const parentTileBrandPrimary = {
  teal: parentTealBrand,
  purple: parentPurpleBrand,
} as const;

export const parentTileBrandIconBg = {
  teal: 'rgba(42, 157, 143, 0.1)',
  purple: 'rgba(123, 107, 196, 0.1)',
} as const;

export const parentTileBrandIconBorder = {
  teal: 'rgba(42, 157, 143, 0.2)',
  purple: 'rgba(123, 107, 196, 0.22)',
} as const;

/** Default resting shadow for white dashboard tiles. */
export const parentTileRestShadow = '0 4px 18px rgba(15, 23, 42, 0.06)';

export const parentIconRing = 'rgba(255, 255, 255, 0.26)';

/** Bottom nav active indicator — softened brand blue. */
export const parentNavActive = '#3D6BA8';
/** Bottom nav active icon tint — very subtle, no hard pill. */
export const parentNavActiveTint = 'rgba(46, 84, 148, 0.06)';
