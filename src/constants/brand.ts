/** User-facing product brand. Logos: assets/images/brand/ */

export const APP_BRAND_NAME = "MyTuition";

export const APP_BRAND_TAGLINE = "Manage. Learn. Grow. Together";

export const APP_SUPPORT_EMAIL = "support@wovello.com";

/** Platform website (footer / powered-by logo). */
export const WOVELLO_WEBSITE_URL = "https://www.wovello.com/";

/** Public scan landing for teacher-issued class cards (`?card=` token only). */
export const CLASS_CARD_PUBLIC_SCAN_URL = "https://mytuition.wovello.com/welcome";

export const APP_COMMUNITY_TITLE = `${APP_BRAND_NAME} Community`;

/** True for the platform community chat (including the old XEN label). */
export function isAppCommunityTitle(name: string): boolean {
  const n = name.trim().toLowerCase();
  return (
    n === "xen" ||
    n === "xen community" ||
    n === APP_BRAND_NAME.toLowerCase() ||
    n === APP_COMMUNITY_TITLE.toLowerCase()
  );
}

/** Map leftover XEN community names to MyTuition Community. */
export function normalizeCommunityTitle(raw: string | null | undefined): string {
  const title = raw?.trim() ?? "";
  if (!title || isAppCommunityTitle(title)) return APP_COMMUNITY_TITLE;
  return title;
}

/**
 * Product mark: mentor/graduate circle (PNG + WebP).
 * Wordmark text: “My” azure + “Tuition” navy via `MyTuitionWordmark`.
 * Platform: Wovello powered-by assets.
 */
export const BrandAssets = {
  /** MyTuition mark — light UI (navy on transparent). Prefer PNG on native. */
  markPng: require("@/assets/images/brand/mytuition-mark.png"),
  markWebp: require("@/assets/images/brand/mytuition-mark-web.webp"),
  /** Same mark at full-header size export. */
  fullPng: require("@/assets/images/brand/mytuition-full.png"),
  fullWebp: require("@/assets/images/brand/mytuition-full-web.webp"),

  /** Platform footer / powered-by (dark wordmark on light UI). */
  poweredByWovello: require("@/assets/images/brand/wovello-logo-lightbackground.png"),
  /** Compact Wovello mark. */
  wovelloMark: require("@/assets/images/brand/wovello-mark-only.png"),
  /** Alternate powered-by lockup. */
  wovelloPowered: require("@/assets/images/brand/wovello-powered-logo.png"),

  /** Marketing landing — teacher + live class illustration. */
  landingLiveClass: require("@/assets/landing/hero-live-class.png"),
} as const;

export const HAS_MYTUITION_LOGO_ASSETS = true;
