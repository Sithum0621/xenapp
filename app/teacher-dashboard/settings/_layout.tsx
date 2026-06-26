import { Stack } from 'expo-router';

import {
  globalStackScreenLayout,
  globalStackScreenOptions,
} from '@/src/navigation/globalStackKeyboardLayout';

export default function TeacherSettingsLayout() {
  return (
    <Stack
      screenLayout={globalStackScreenLayout}
      screenOptions={{ headerShown: false, ...globalStackScreenOptions }}
    />
  );
}
