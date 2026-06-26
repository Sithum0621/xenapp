import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import type { ParentTab } from '@/src/navigation/parentDashboardTabStore';
import { setParentDashboardTab } from '@/src/navigation/parentDashboardTabStore';
import {
  fetchActiveGamesScheduleExams,
  type ActiveGamesScheduleExam,
} from '@/src/services/studentGamesScheduleApi';
import { remainingSecondsUntilDeadline } from '@/src/utils/gamesScheduleExamTimer';

type ActiveGamesScheduleExamContextValue = {
  activeExam: ActiveGamesScheduleExam | null;
  remainingSeconds: number;
  dashboardTab: ParentTab;
  setDashboardTab: (tab: ParentTab) => void;
  /** Switch dashboard tab from outside the index screen (e.g. exam overlay dismiss). */
  requestDashboardTab: (tab: ParentTab) => void;
  pendingDashboardTab: ParentTab | null;
  clearPendingDashboardTab: () => void;
  registerActiveExam: (exam: ActiveGamesScheduleExam | null) => void;
  refresh: () => Promise<void>;
};

const ActiveGamesScheduleExamContext = createContext<ActiveGamesScheduleExamContextValue>({
  activeExam: null,
  remainingSeconds: 0,
  dashboardTab: 'home',
  setDashboardTab: () => undefined,
  requestDashboardTab: () => undefined,
  pendingDashboardTab: null,
  clearPendingDashboardTab: () => undefined,
  registerActiveExam: () => undefined,
  refresh: async () => undefined,
});

export function ActiveGamesScheduleExamProvider({ children }: { children: ReactNode }) {
  const [activeExam, setActiveExam] = useState<ActiveGamesScheduleExam | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [dashboardTab, setDashboardTabState] = useState<ParentTab>('home');
  const [pendingTab, setPendingTab] = useState<ParentTab | null>(null);

  const applyDashboardTab = useCallback((tab: ParentTab) => {
    setParentDashboardTab(tab);
    setDashboardTabState(tab);
  }, []);

  const setDashboardTab = applyDashboardTab;

  const requestDashboardTab = useCallback(
    (tab: ParentTab) => {
      applyDashboardTab(tab);
      setPendingTab(tab);
    },
    [applyDashboardTab],
  );

  const clearPendingTab = useCallback(() => {
    setPendingTab(null);
  }, []);

  const registerActiveExam = useCallback((exam: ActiveGamesScheduleExam | null) => {
    setActiveExam(exam);
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetchActiveGamesScheduleExams();
    if (res.ok) {
      setActiveExam(res.exams[0] ?? null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    if (!activeExam?.deadline_at) {
      setRemainingSeconds(0);
      return;
    }

    const tick = () => {
      const next = remainingSecondsUntilDeadline(activeExam.deadline_at);
      setRemainingSeconds(next);
      if (next <= 0) {
        setActiveExam(null);
        void refresh();
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeExam?.deadline_at, refresh]);

  const value = useMemo(
    () => ({
      activeExam,
      remainingSeconds,
      dashboardTab,
      setDashboardTab,
      requestDashboardTab,
      pendingDashboardTab: pendingTab,
      clearPendingDashboardTab: clearPendingTab,
      registerActiveExam,
      refresh,
    }),
    [
      activeExam,
      remainingSeconds,
      dashboardTab,
      setDashboardTab,
      requestDashboardTab,
      pendingTab,
      clearPendingTab,
      registerActiveExam,
      refresh,
    ],
  );

  return (
    <ActiveGamesScheduleExamContext.Provider value={value}>
      {children}
    </ActiveGamesScheduleExamContext.Provider>
  );
}

export function useActiveGamesScheduleExam() {
  return useContext(ActiveGamesScheduleExamContext);
}
