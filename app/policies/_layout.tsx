import { Stack } from 'expo-router';

import {
  globalStackScreenLayout,
  globalStackScreenOptions,
} from '@/src/navigation/globalStackKeyboardLayout';

export default function PoliciesLayout() {
  return (
    <Stack
      screenLayout={globalStackScreenLayout}
      screenOptions={{ headerShown: false, ...globalStackScreenOptions }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="return" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="terms" />
    </Stack>
  );
}
