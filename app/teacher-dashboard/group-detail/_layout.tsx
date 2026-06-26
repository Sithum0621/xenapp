import { Stack } from 'expo-router';

import {
  globalStackScreenLayout,
  globalStackScreenOptions,
} from '@/src/navigation/globalStackKeyboardLayout';

export default function GroupDetailLayout() {
  return (
    <Stack
      screenLayout={globalStackScreenLayout}
      screenOptions={{ headerShown: false, ...globalStackScreenOptions }}
    />
  );
}
