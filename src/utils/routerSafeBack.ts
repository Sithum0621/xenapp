import type { Href, Router } from 'expo-router';

/**
 * Pops when history exists; otherwise `replace` so UI / Android never dispatch GO_BACK with no handler.
 */
export function routerBackOrReplace(router: Router, fallback: Href): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback);
  }
}
