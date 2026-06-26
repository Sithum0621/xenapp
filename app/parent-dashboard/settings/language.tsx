import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import SettingsLanguageScreen from '@/src/screens/settings/SettingsLanguageScreen';
import { parentBrandBlueDark } from '@/src/theme/parentDashboardPalette';
import { Text } from '@/src/theme/Text';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

export default function ParentLanguageSettings() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => routerBackOrReplace(router, appHref(AppRoutes.parentDashboard))}
          style={({ pressed }) => [styles.backRow, pressed && { opacity: 0.75 }]}>
          <Ionicons name="chevron-back" size={22} color={parentBrandBlueDark} />
          <Text style={styles.backLabel}>{t('appLock.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('parentDashboard.settingsLanguage')}</Text>
      </View>
      <SettingsLanguageScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  backLabel: { fontSize: 16, fontWeight: '700', color: parentBrandBlueDark },
  title: { fontSize: 22, fontWeight: '800', color: parentBrandBlueDark, paddingHorizontal: 8 },
});
