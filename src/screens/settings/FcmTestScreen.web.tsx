import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/src/theme/Text';
import { parentBrandBlueDark, parentSurfaceAlt } from '@/src/theme/parentDashboardPalette';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

export default function FcmTestScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('fcmTest.title')}</Text>
        <Text style={styles.body}>{t('fcmTest.unsupportedWeb')}</Text>
        <Pressable onPress={() => routerBackOrReplace(router, '/parent-dashboard')} style={styles.btn}>
          <Text style={styles.btnText}>{t('fcmTest.back')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: parentSurfaceAlt },
  content: { flex: 1, padding: 24, justifyContent: 'center', gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: parentBrandBlueDark },
  body: { fontSize: 15, lineHeight: 22, color: parentBrandBlueDark },
  btn: { marginTop: 8, alignSelf: 'flex-start', paddingVertical: 12, paddingHorizontal: 16 },
  btnText: { fontSize: 16, fontWeight: '600', color: parentBrandBlueDark },
});
