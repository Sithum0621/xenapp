import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { StyleSheet, View } from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';

import { useAdminLayout } from '@/src/hooks/useAdminLayout';

const BRAND_BLUE_DARK = '#00101F';
const TEXT_MUTED = '#64748B';

export default function AdminStudentsScreen() {
  const { t } = useTranslation();
  const { isCompact, contentPadding } = useAdminLayout();

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, contentPadding]}>
      {!isCompact ? <Text style={styles.title}>{t('adminPortal.studentsTitle')}</Text> : null}
      <View style={styles.card}>
        <Text style={styles.placeholder}>{t('adminPortal.studentsPlaceholder')}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { flexGrow: 1, width: '100%' },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginBottom: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 20,
    width: '100%',
  },
  placeholder: {
    fontSize: 15,
    color: TEXT_MUTED,
    lineHeight: 22,
  },
});
