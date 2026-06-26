import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { Platform, StyleSheet, View } from 'react-native';

import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';

import type { TeacherGroupRouteContext } from '@/src/utils/teacherGroupRouteParams';

const BRAND_BLUE_DARK = '#0E2F63';
const BORDER = '#E2E8F0';

type Tile = {
  key: 'stats' | 'schedule' | 'attendance' | 'students' | 'mcq';
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  labelKey: string;
  subKey: string;
  path: string;
};

/** Absolute paths: relative `./stats` resolves from `teacher-dashboard/` and 404s as `/teacher-dashboard/stats`. */
const TILES: Tile[] = [
  {
    key: 'stats',
    icon: 'stats-chart',
    iconBg: '#DBEAFE',
    labelKey: 'menuStats',
    subKey: 'menuStatsSub',
    path: '/teacher-dashboard/group-detail/stats',
  },
  {
    key: 'schedule',
    icon: 'calendar-outline',
    iconBg: '#DCFCE7',
    labelKey: 'menuSchedule',
    subKey: 'menuScheduleSub',
    path: '/teacher-dashboard/group-detail/schedule',
  },
  {
    key: 'attendance',
    icon: 'checkmark-done-outline',
    iconBg: '#FFEDD5',
    labelKey: 'menuAttendance',
    subKey: 'menuAttendanceSub',
    path: '/teacher-dashboard/group-detail/attendance',
  },
  {
    key: 'students',
    icon: 'school-outline',
    iconBg: '#FEE2E2',
    labelKey: 'menuStudents',
    subKey: 'menuStudentsSub',
    path: '/teacher-dashboard/group-detail/students',
  },
  {
    key: 'mcq',
    icon: 'help-circle-outline',
    iconBg: '#EDE9FE',
    labelKey: 'menuMcq',
    subKey: 'menuMcqSub',
    path: '/teacher-dashboard/group-detail/mcq',
  },
];

type Props = {
  ctx: TeacherGroupRouteContext;
};

export default function TeacherGroupDetailMenu({ ctx }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const gd = (k: string) => t(`teacherDashboard.groupDetail.${k}`);

  const baseParams = {
    title: ctx.title || t('teacherDashboard.groupsDetailFallbackTitle'),
    source: ctx.source,
    id: ctx.groupId,
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {TILES.map((tile) => (
          <ScrollFriendlyPressable
            key={tile.key}
            accessibilityRole="button"
            accessibilityLabel={gd(tile.labelKey)}
            onPress={() => router.push({ pathname: tile.path, params: baseParams } as never)}
            style={styles.tile}
            innerStyle={styles.tileInner}>
            <View style={[styles.tileIcon, { backgroundColor: tile.iconBg }]}>
              <Ionicons name={tile.icon} size={26} color={BRAND_BLUE_DARK} />
            </View>
            <View style={styles.tileTextCol}>
              <Text style={styles.tileTitle}>{gd(tile.labelKey)}</Text>
              <Text style={styles.tileSub}>{gd(tile.subKey)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" style={styles.tileChevron} />
          </ScrollFriendlyPressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 18,
    marginTop: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    width: '47%',
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  tileInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    minHeight: 88,
    paddingVertical: 16,
    paddingHorizontal: 14,
    paddingRight: 36,
  },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tileTextCol: {
    flex: 1,
    minWidth: 0,
  },
  tileTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  tileSub: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    lineHeight: 16,
  },
  tileChevron: {
    position: 'absolute',
    right: 14,
    top: '50%',
    marginTop: -9,
  },
});
