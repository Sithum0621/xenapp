import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { Modal } from 'react-native';

import ActiveGamesScheduleExamOverlay from '@/src/components/parent/ActiveGamesScheduleExamOverlay';
import { useActiveGamesScheduleExam } from '@/src/contexts/ActiveGamesScheduleExamContext';

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

function isExamPaperPath(pathname: string): boolean {
  return pathname.includes('/games-event/');
}

function isDashboardIndexPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === '/parent-dashboard' || path === '/parent-dashboard/index';
}

/** Blocks non-Games surfaces while a games schedule exam is in progress. */
export default function ActiveGamesScheduleExamGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const { activeExam, refresh, requestDashboardTab } = useActiveGamesScheduleExam();

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  const dismissToGames = useCallback(() => {
    requestDashboardTab('games');
    if (!isDashboardIndexPath(pathname)) {
      router.replace('/parent-dashboard');
    }
  }, [pathname, requestDashboardTab, router]);

  const shouldBlock = useMemo(() => {
    if (!activeExam) return false;
    if (isExamPaperPath(pathname)) return false;
    if (isDashboardIndexPath(pathname)) return false;
    return true;
  }, [activeExam, pathname]);

  const handleRequestClose = useCallback(() => {
    dismissToGames();
  }, [dismissToGames]);

  if (!shouldBlock || !activeExam) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={handleRequestClose}>
      <ActiveGamesScheduleExamOverlay visible onDismiss={dismissToGames} />
    </Modal>
  );
}
