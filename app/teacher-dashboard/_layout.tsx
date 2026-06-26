import { Stack } from 'expo-router';

import {
  globalStackScreenLayout,
  globalStackScreenOptions,
} from '@/src/navigation/globalStackKeyboardLayout';

export default function TeacherDashboardLayout() {
  return (
    <Stack
      screenLayout={globalStackScreenLayout}
      screenOptions={{ headerShown: false, ...globalStackScreenOptions }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="wallet" />
      <Stack.Screen name="my-timetable" />
      <Stack.Screen name="income-breakdown" />
      <Stack.Screen name="payments" />
      <Stack.Screen name="collect-payment" />
      <Stack.Screen name="class-attendance" />
      <Stack.Screen name="mark-attendance" />
      <Stack.Screen name="group-detail" />
      <Stack.Screen name="chats/[groupId]" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
