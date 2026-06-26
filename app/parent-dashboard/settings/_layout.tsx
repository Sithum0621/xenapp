import { Stack } from 'expo-router';

import {
  globalStackScreenLayout,
  globalStackScreenOptions,
} from '@/src/navigation/globalStackKeyboardLayout';

export default function ParentSettingsLayout() {
  return (
    <Stack
      screenLayout={globalStackScreenLayout}
      screenOptions={{ headerShown: false, ...globalStackScreenOptions }}
    />
  );
}
