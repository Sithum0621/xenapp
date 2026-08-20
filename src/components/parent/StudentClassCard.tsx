import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { StudentClass } from '@/src/services/studentClassesApi';
import { Text } from '@/src/theme/Text';

const BRAND_BLUE_DARK = '#00101F';
const BRAND_BLUE = '#041830';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const SURFACE = '#FFFFFF';

export type StudentClassCardProps = {
  group: StudentClass;
  nextText: string;
  teacherName: string;
  monthlyFee: string;
  paymentStatusText: string;
  statusColor: string;
};

function StudentClassCard({
  group,
  nextText,
  teacherName,
  monthlyFee,
  paymentStatusText,
  statusColor,
}: StudentClassCardProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.cardTitle} numberOfLines={2}>
        {group.groupName}
      </Text>
      <View style={styles.cardMetaBlock}>
        <View style={styles.cardMetaRow}>
          <Text style={styles.cardMetaLabel}>{t('parentDashboard.classesTeacher')}</Text>
          <Text style={styles.cardMetaValue} numberOfLines={1}>
            {teacherName}
          </Text>
        </View>
        <View style={styles.cardMetaRow}>
          <Text style={styles.cardMetaLabel}>{t('parentDashboard.classesMonthlyFee')}</Text>
          <Text style={styles.cardMetaValueFee} numberOfLines={1}>
            {monthlyFee}
          </Text>
        </View>
        <View style={styles.cardMetaRow}>
          <Text style={styles.cardMetaLabel}>{t('parentDashboard.classesPaymentStatus')}</Text>
          <Text style={[styles.cardMetaValueStatus, { color: statusColor }]} numberOfLines={1}>
            {paymentStatusText}
          </Text>
        </View>
      </View>
      <View style={styles.divider} />
      <View style={styles.metaRow}>
        <Ionicons name="time-outline" size={15} color={TEXT_MUTED} />
        <Text style={styles.metaLabel}>{t('parentDashboard.classesNextClass')}</Text>
        <Text style={styles.metaValue} numberOfLines={1}>
          {nextText}
        </Text>
      </View>
    </View>
  );
}

export default memo(StudentClassCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    letterSpacing: -0.1,
  },
  cardMetaBlock: { gap: 6 },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardMetaLabel: { fontSize: 12.5, color: TEXT_MUTED, fontWeight: '600' },
  cardMetaValue: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    textAlign: 'right',
  },
  cardMetaValueFee: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '800',
    color: BRAND_BLUE,
    textAlign: 'right',
  },
  cardMetaValueStatus: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '800',
    textAlign: 'right',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: BORDER },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaLabel: { fontSize: 12, color: TEXT_MUTED, fontWeight: '600' },
  metaValue: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
});
