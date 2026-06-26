import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { Platform, StyleSheet, View } from 'react-native';

import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';

import { FontFamily } from '@/src/theme/fonts';

import {
  parentBorder,
  parentBrandBlue,
  parentBrandBlueDark,
  parentSurface,
} from '@/src/theme/parentDashboardPalette';

const BRAND_BLUE_DARK = parentBrandBlueDark;
const BRAND_BLUE = parentBrandBlue;
const BORDER = parentBorder;
const SURFACE = parentSurface;

export type MyClassCardButtonProps = {
  studentUserId: string | null;
};

/**
 * Full-width action that opens the student's digital class card screen.
 */
export default function MyClassCardButton({ studentUserId }: MyClassCardButtonProps) {
  const { t } = useTranslation();

  const onPress = () => {
    if (!studentUserId) return;
    router.push({
      pathname: '/parent-dashboard/class-card',
      params: { studentId: studentUserId },
    });
  };

  return (
    <ScrollFriendlyPressable
      accessibilityRole="button"
      accessibilityLabel={t('parentDashboard.myClassCardTitle')}
      disabled={!studentUserId}
      onPress={onPress}
      style={[!studentUserId && styles.buttonDisabled]}
      innerStyle={[styles.button, !studentUserId && styles.buttonDisabled]}>
      <View style={styles.iconTile} pointerEvents="none">
        <Ionicons name="card-outline" size={22} color={BRAND_BLUE} />
      </View>
      <Text style={styles.label} pointerEvents="none">
        {t('parentDashboard.myClassCardTitle')}
      </Text>
      <Ionicons name="chevron-forward" size={20} color={BRAND_BLUE_DARK} pointerEvents="none" />
    </ScrollFriendlyPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    paddingVertical: 14,
    paddingHorizontal: 16,
    width: '100%',
    ...Platform.select({
      android: { elevation: 3 },
      default: {
        shadowColor: '#0E2F63',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
      },
    }),
  },
  buttonPressed: { opacity: 0.92 },
  buttonDisabled: { opacity: 0.55 },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(46, 84, 148, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    letterSpacing: -0.2,
  },
});
