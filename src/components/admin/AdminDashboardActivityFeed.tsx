import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Text } from '@/src/theme/Text';
import {
  formatRelativeActivityTime,
  type AdminDashboardActivityItem,
} from '@/src/services/instituteAdminDashboardApi';

const BRAND_BLUE_DARK = '#0E2F63';
const SUBTLE_BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';

type Props = {
  items: AdminDashboardActivityItem[];
  loading: boolean;
  error: string | null;
};

function activityIcon(kind: AdminDashboardActivityItem['kind']): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'student_registered':
    case 'student_enrolled_group':
      return 'person-add-outline';
    case 'teacher_assigned':
      return 'school-outline';
    case 'attendance_marked':
      return 'checkmark-circle-outline';
    default:
      return 'notifications-outline';
  }
}

function activityColor(kind: AdminDashboardActivityItem['kind']): string {
  switch (kind) {
    case 'attendance_marked':
      return '#047857';
    case 'teacher_assigned':
      return '#123B7A';
    default:
      return '#B45309';
  }
}

export default function AdminDashboardActivityFeed({ items, loading, error }: Props) {
  const { t, i18n } = useTranslation();

  const describe = (item: AdminDashboardActivityItem) => {
    switch (item.kind) {
      case 'student_registered':
        return t('adminPortal.dashboardActivityStudentRegistered');
      case 'student_enrolled_group':
        return item.subtitle.startsWith('Enrolled in ')
          ? t('adminPortal.dashboardActivityStudentEnrolled', {
              group: item.subtitle.replace(/^Enrolled in /, ''),
            })
          : item.subtitle;
      case 'teacher_assigned':
        return t('adminPortal.dashboardActivityTeacherAssigned');
      case 'attendance_marked':
        return item.subtitle;
      default:
        return item.subtitle;
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('adminPortal.dashboardActivityTitle')}</Text>
      <Text style={styles.sectionHint}>{t('adminPortal.dashboardActivityHint')}</Text>

      {loading && items.length === 0 ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color="#123B7A" size="small" />
        </View>
      ) : error && items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{t('adminPortal.dashboardActivityError')}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{t('adminPortal.dashboardActivityEmpty')}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item, index) => {
            const color = activityColor(item.kind);
            return (
              <View
                key={`${item.kind}-${item.occurredAt}-${item.userId ?? index}`}
                style={[styles.row, index === items.length - 1 && styles.rowLast]}>
                <View style={[styles.iconWrap, { backgroundColor: `${color}18` }]}>
                  <Ionicons name={activityIcon(item.kind)} size={18} color={color} />
                </View>
                <View style={styles.main}>
                  <Text style={styles.title} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.subtitle} numberOfLines={2}>
                    {describe(item)}
                  </Text>
                  <Text style={styles.time}>{formatRelativeActivityTime(item.occurredAt, i18n.language)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 20, width: '100%' },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 13,
    color: TEXT_MUTED,
    marginBottom: 12,
    lineHeight: 18,
  },
  list: {
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SUBTLE_BORDER,
  },
  rowLast: { borderBottomWidth: 0 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  main: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 14, fontWeight: '700', color: BRAND_BLUE_DARK, lineHeight: 19 },
  subtitle: { fontSize: 13, color: TEXT_MUTED, lineHeight: 18 },
  time: { fontSize: 11, color: TEXT_MUTED, marginTop: 2 },
  centerBox: { paddingVertical: 20, alignItems: 'center' },
  emptyBox: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#F8FAFC',
  },
  emptyText: { fontSize: 14, color: TEXT_MUTED, lineHeight: 20 },
});
