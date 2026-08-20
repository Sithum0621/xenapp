import { usePwaInstall } from '@/src/hooks/usePwaInstall';

/**
 * Mount once at app root on web so manifest + service worker are ready
 * before the user taps “Get App” (Expo SPA export skips `+html.tsx`).
 */
export default function PwaInstallBootstrap() {
  usePwaInstall();
  return null;
}
