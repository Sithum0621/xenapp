import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';

import type { TodayScheduleItem } from '@/src/services/parentStudentsApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';

import {
  parentBrandBlueDark,
  parentInkSoft,
  parentScheduleTimeBg,
  parentSurface,
} from '@/src/theme/parentDashboardPalette';

const BRAND_BLUE_DARK = parentBrandBlueDark;
const TEXT_MUTED = parentInkSoft;
const SURFACE = parentSurface;
const TIME_BAR_BG = parentScheduleTimeBg;

export type TodayScheduleSessionCardProps = {
  item: TodayScheduleItem;
  timeLabel: string;
};

export default function TodayScheduleSessionCard({
  item,
  timeLabel,
}: TodayScheduleSessionCardProps) {
  const { t } = useTranslation();
  const { delivery } = item;
  const isOnline = delivery.mode === 'online';

  const actionLabel = isOnline
    ? t('parentDashboard.todayScheduleJoinNow')
    : delivery.physicalLocationLabel?.trim() ||
      t('parentDashboard.todayScheduleViewLocation');

  const actionUrl = isOnline
    ? delivery.onlineJoinUrl
    : delivery.physicalLocationUrl;

  const onAction = () => {
    if (!actionUrl?.trim()) return;
    void Linking.openURL(actionUrl.trim()).catch(() => undefined);
  };

  return (
    <View style={styles.session}>
      <View style={styles.timeBar}>
        <Ionicons name="time-outline" size={16} color={BRAND_BLUE_DARK} />
        <Text style={styles.timeText}>{timeLabel}</Text>
      </View>

      <Text style={styles.classTitle} numberOfLines={2}>
        {item.groupName}
      </Text>

      <View style={styles.venueRow}>
        <Ionicons name="location-outline" size={14} color={TEXT_MUTED} />
        <Text style={styles.venueText} numberOfLines={1}>
          {delivery.venueLabel}
        </Text>
      </View>

      <Text style={styles.modeLabel}>
        {isOnline
          ? t('parentDashboard.todayScheduleOnlineClass')
          : t('parentDashboard.todaySchedulePhysicalClass')}
      </Text>

      <ScrollFriendlyPressable
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        disabled={!actionUrl?.trim()}
        onPress={onAction}
        style={[
          styles.actionBtn,
          !actionUrl?.trim() && styles.actionBtnDisabled,
        ]}>
        <Text style={styles.actionBtnText}>{actionLabel}</Text>
      </ScrollFriendlyPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  session: {
    gap: 8,
    paddingBottom: 4,
  },
  timeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: TIME_BAR_BG,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  timeText: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    letterSpacing: -0.1,
  },
  classTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    letterSpacing: -0.15,
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  venueText: {
    flex: 1,
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
  modeLabel: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: BRAND_BLUE_DARK,
  },
  actionBtn: {
    alignSelf: 'stretch',
    backgroundColor: BRAND_BLUE_DARK,
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  actionBtnPressed: { opacity: 0.9 },
  actionBtnDisabled: { opacity: 0.45 },
  actionBtnText: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: SURFACE,
    letterSpacing: 0.1,
  },
});
