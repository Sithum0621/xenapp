import { useCallback } from 'react';

/** Web PWA install prompt hook — no-op until a store listing is wired. */
export function usePwaInstall(): {
  canInstall: boolean;
  installed: boolean;
  promptInstall: () => Promise<boolean>;
} {
  const promptInstall = useCallback(async () => false, []);
  return { canInstall: false, installed: false, promptInstall };
}
