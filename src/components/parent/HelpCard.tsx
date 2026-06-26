import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

const BRAND_BLUE_DARK = '#0E2F63';
const BRAND_BLUE = '#123B7A';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const SURFACE = '#FFFFFF';

const SUPPORT_EMAIL = 'support@xen.app';

async function openUrl(url: string, errorTitle: string, errorBody: string): Promise<void> {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      appAlert(errorTitle, errorBody);
      return;
    }
    await Linking.openURL(url);
  } catch {
    appAlert(errorTitle, errorBody);
  }
}

export default function HelpCard() {
  const { t } = useTranslation();

  const handleEmail = () => {
    void openUrl(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t('parentDashboard.helpEmailSubject'))}`,
      t('parentDashboard.helpUnavailableTitle'),
      t('parentDashboard.helpUnavailableBody'),
    );
  };

  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.headerRow}>
        <View style={styles.iconTile}>
          <Ionicons name="help-buoy" size={18} color="#FFFFFF" />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('parentDashboard.helpTitle')}</Text>
          <Text style={styles.subtitle}>{t('parentDashboard.helpSubtitle')}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('parentDashboard.helpEmailAction')}
        onPress={handleEmail}
        style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}>
        <Ionicons name="mail-outline" size={16} color="#FFFFFF" />
        <Text style={styles.primaryBtnText}>{t('parentDashboard.helpEmailAction')}</Text>
      </Pressable>

      <Text style={styles.contactNote}>
        {t('parentDashboard.helpContactNote', { email: SUPPORT_EMAIL })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    paddingVertical: 18,
    paddingHorizontal: 18,
    gap: 12,
    ...Platform.select({
      android: { elevation: 2 },
      default: {
        shadowColor: '#0E2F63',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 14,
      },
    }),
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '800', color: BRAND_BLUE_DARK, letterSpacing: -0.1 },
  subtitle: { fontSize: 12.5, color: TEXT_MUTED },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: BORDER },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
  },
  primaryBtnPressed: { opacity: 0.9 },
  primaryBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  contactNote: { fontSize: 11.5, color: TEXT_MUTED, textAlign: 'center' },
});
