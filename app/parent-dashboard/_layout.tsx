import { Stack } from 'expo-router';

import ActiveGamesScheduleExamGuard from '@/src/components/parent/ActiveGamesScheduleExamGuard';
import { ActiveGamesScheduleExamProvider } from '@/src/contexts/ActiveGamesScheduleExamContext';
import {
  globalStackScreenLayout,
  globalStackScreenOptions,
} from '@/src/navigation/globalStackKeyboardLayout';

export default function ParentDashboardLayout() {
  return (
    <ActiveGamesScheduleExamProvider>
      <Stack
        screenLayout={globalStackScreenLayout}
        screenOptions={{ headerShown: false, ...globalStackScreenOptions }}
      />
      <ActiveGamesScheduleExamGuard />
    </ActiveGamesScheduleExamProvider>
  );
}
