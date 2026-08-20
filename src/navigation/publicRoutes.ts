/**
 * Routes that may be opened without an authenticated session.
 * Policies are intentionally public for PayHere / legal deep links.
 */

export function normalizeAppPathname(pathname: string | null | undefined): string {
  if (!pathname) return '/';
  let trimmed = pathname.trim();
  if (!trimmed || trimmed === '/') return '/';
  if (!trimmed.startsWith('/')) trimmed = `/${trimmed}`;
  return trimmed.replace(/\/+$/, '') || '/';
}

/** Full policies hub + document pages (`/policies`, `/policies/return`, …). */
export function isPoliciesPath(pathname: string | null | undefined): boolean {
  const path = normalizeAppPathname(pathname);
  return path === '/policies' || path.startsWith('/policies/');
}

/**
 * Unauthenticated visitors may stay on these paths.
 * Everything else (dashboards, wallet, etc.) requires a session.
 */
export function isPublicUnauthenticatedPath(pathname: string | null | undefined): boolean {
  const path = normalizeAppPathname(pathname);

  if (path === '/') return true;
  if (isPoliciesPath(path)) return true;

  const exact = new Set([
    '/language',
    '/welcome',
    '/role-select',
    '/login',
    '/signup',
    '/auth',
    '/superadmin-verify',
    '/terms-and-conditions',
    '/modal',
  ]);
  return exact.has(path);
}
