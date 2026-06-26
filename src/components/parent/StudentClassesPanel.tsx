import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  type RefreshControlProps,
  StyleSheet,
  View,
} from 'react-native';
import { TextInput } from '@/src/theme/TextInput';

import { NativeFluidFlatList } from '@/src/components/layout/NativeFluidFlatList';
import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';
import StudentClassCard, { type StudentClassCardProps } from '@/src/components/parent/StudentClassCard';
import {
  computeNextClass,
  fetchStudentClasses,
  type NextClass,
  type StudentClass,
} from '@/src/services/studentClassesApi';
import {
  formatLkrFromCents,
  teacherNameFromGroupTitle,
} from '@/src/utils/classesPlaceholderBilling';
import {
  formatBillingMonthLabel,
  paymentStatusColor,
} from '@/src/utils/classPaymentStatus';
import { Text } from '@/src/theme/Text';

const BRAND_BLUE_DARK = '#0E2F63';
const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_SOFT = 'rgba(18, 59, 122, 0.08)';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const SURFACE = '#FFFFFF';
const ERROR = '#B42318';

export type StudentClassesPanelProps = {
  studentUserId?: string | null;
  isTabActive?: boolean;
  refreshNonce?: number;
  emptyTitle: string;
  emptyBody: string;
  listHeader?: ReactNode;
  contentPaddingBottom?: number;
  refreshControl?: ReactElement<RefreshControlProps>;
};

function resolveTeacherName(
  group: StudentClass,
  unknownTeacherLabel: string,
  pendingTeacherLabel: string,
): string {
  if (group.groupSource === 'personal') {
    return group.instituteName || unknownTeacherLabel;
  }
  return teacherNameFromGroupTitle(group.groupName) ?? pendingTeacherLabel;
}

function classMatchesQuery(group: StudentClass, q: string): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  const teacher =
    group.teacherName ||
    (group.groupSource === 'personal' ? group.instituteName : '') ||
    '';
  return (
    group.groupName.toLowerCase().includes(n) ||
    (group.instituteName ?? '').toLowerCase().includes(n) ||
    teacher.toLowerCase().includes(n)
  );
}

function formatNextClass(
  next: NextClass | null,
  weekdayKey: (dow: number) => string,
  todayLabel: string,
  tomorrowLabel: string,
  tbcLabel: string,
): string {
  if (!next) return tbcLabel;

  const startsAt = next.startsAt;
  const now = new Date();
  const startDate = new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  let dayLabel: string;
  if (startDate.getTime() === today.getTime()) {
    dayLabel = todayLabel;
  } else if (startDate.getTime() === tomorrow.getTime()) {
    dayLabel = tomorrowLabel;
  } else {
    dayLabel = weekdayKey(startsAt.getDay());
  }

  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${dayLabel}, ${timeFormatter.format(startsAt)}`;
}

export default function StudentClassesPanel({
  studentUserId,
  isTabActive = true,
  refreshNonce = 0,
  emptyTitle,
  emptyBody,
  listHeader,
  contentPaddingBottom = 0,
  refreshControl,
}: StudentClassesPanelProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classes, setClasses] = useState<StudentClass[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    const studentId = studentUserId?.trim() ?? '';
    if (!studentId) {
      setClasses([]);
      setError(null);
      setLoading(false);
      return;
    }

    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError(null);

    const res = await fetchStudentClasses(studentId);
    if (seq !== loadSeqRef.current) return;

    if (res.ok) {
      setClasses(res.classes);
      setError(null);
    } else {
      setClasses([]);
      setError(res.error);
    }
    setLoading(false);
  }, [studentUserId]);

  useEffect(() => {
    if (!isTabActive) return;
    void load();
  }, [load, isTabActive, refreshNonce]);

  useEffect(() => {
    setSearchQuery('');
  }, [studentUserId]);

  const searchActive = searchQuery.trim().length > 0;

  const displayedClasses = useMemo(
    () => classes.filter((group) => classMatchesQuery(group, searchQuery)),
    [classes, searchQuery],
  );

  useEffect(() => {
    if (!isTabActive) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => sub.remove();
  }, [isTabActive, load]);

  const weekdayKey = useCallback(
    (dow: number) =>
      t(`parentDashboard.weekdays.${(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[dow] ?? 'sun'}`),
    [t],
  );

  const cardPropsByKey = useMemo(() => {
    const map = new Map<string, Omit<StudentClassCardProps, 'group'>>();
    for (const group of classes) {
      const next = computeNextClass(group.schedules);
      const nextText = formatNextClass(
        next,
        weekdayKey,
        t('parentDashboard.today'),
        t('parentDashboard.tomorrow'),
        t('parentDashboard.classesNoSchedule'),
      );
      const teacherName =
        group.teacherName ||
        resolveTeacherName(
          group,
          t('parentDashboard.classesUnknownTeacher'),
          t('parentDashboard.classesTeacherPending'),
        );
      const monthlyFee = formatLkrFromCents(
        group.paymentAmountCents > 0 ? group.paymentAmountCents : group.monthlyFeeCents,
      );
      const paymentMonth = formatBillingMonthLabel(
        group.paymentBillingMonth || new Date().toISOString().slice(0, 10),
      );
      const paymentStatusKey =
        group.paymentStatus === 'paid'
          ? 'parentDashboard.classesPaymentPaid'
          : group.paymentStatus === 'overdue'
            ? 'parentDashboard.classesPaymentOverdue'
            : 'parentDashboard.classesPaymentPending';
      const paymentStatusText = t(paymentStatusKey, { month: paymentMonth });
      const statusColor = paymentStatusColor(group.paymentStatus);
      map.set(`${group.groupSource}:${group.lectureGroupId}`, {
        nextText,
        teacherName,
        monthlyFee,
        paymentStatusText,
        statusColor,
      });
    }
    return map;
  }, [classes, t, weekdayKey]);

  const keyExtractor = useCallback(
    (group: StudentClass) => `${group.groupSource}:${group.lectureGroupId}`,
    [],
  );

  const renderItem = useCallback(
    ({ item: group }: { item: StudentClass }) => {
      const props = cardPropsByKey.get(`${group.groupSource}:${group.lectureGroupId}`);
      if (!props) return null;
      return <StudentClassCard group={group} {...props} />;
    },
    [cardPropsByKey],
  );

  const ItemSeparator = useCallback(() => <View style={styles.listSeparator} />, []);

  const ListEmpty = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.loaderCard}>
          <ActivityIndicator size="small" color={BRAND_BLUE} />
          <Text style={styles.loaderText}>{t('parentDashboard.classesLoading')}</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={20} color={ERROR} />
          <View style={styles.errorBody}>
            <Text style={styles.errorTitle}>{t('parentDashboard.classesErrorTitle')}</Text>
            <Text style={styles.errorMessage} numberOfLines={3}>
              {error}
            </Text>
          </View>
          <ScrollFriendlyPressable
            accessibilityRole="button"
            onPress={() => void load()}
            style={styles.retryBtn}
            innerStyle={styles.retryBtnInner}>
            <Ionicons name="refresh" size={16} color={SURFACE} />
            <Text style={styles.retryText}>{t('parentDashboard.classesRetry')}</Text>
          </ScrollFriendlyPressable>
        </View>
      );
    }
    if (searchActive && classes.length > 0) {
      return (
        <View style={styles.placeholderCard}>
          <Ionicons name="search-outline" size={26} color={TEXT_MUTED} />
          <Text style={styles.placeholderTitle}>{t('parentDashboard.classesSearchEmptyTitle')}</Text>
          <Text style={styles.placeholderBody}>{t('parentDashboard.classesSearchEmptyBody')}</Text>
        </View>
      );
    }
    return (
      <View style={styles.placeholderCard}>
        <View style={styles.placeholderIconWrap}>
          <Ionicons name="book-outline" size={26} color={BRAND_BLUE} />
        </View>
        <Text style={styles.placeholderTitle}>{emptyTitle}</Text>
        <Text style={styles.placeholderBody}>{emptyBody}</Text>
      </View>
    );
  }, [loading, error, emptyTitle, emptyBody, t, load, searchActive, classes.length]);

  const ListHeader = useMemo(
    () => (
      <View style={styles.header}>
        {listHeader}
        {!loading && !error && classes.length > 0 ? (
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={20} color={TEXT_MUTED} style={styles.searchIcon} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('parentDashboard.classesSearchPlaceholder')}
              placeholderTextColor={TEXT_MUTED}
              accessibilityLabel={t('parentDashboard.classesSearchPlaceholder')}
              style={styles.searchInput}
            />
            {searchQuery.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('parentDashboard.classesSearchClear')}
                onPress={() => setSearchQuery('')}
                hitSlop={8}
                style={styles.searchClear}>
                <Ionicons name="close-circle" size={20} color={TEXT_MUTED} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    ),
    [listHeader, loading, error, classes.length, searchQuery, t],
  );

  return (
    <NativeFluidFlatList
      style={styles.flex1}
      data={!loading && !error ? displayedClasses : []}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ItemSeparatorComponent={ItemSeparator}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={ListEmpty}
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: contentPaddingBottom },
        displayedClasses.length === 0 ? styles.listContentEmpty : null,
      ]}
      refreshControl={refreshControl}
    />
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  listContent: {
    paddingTop: 0,
    flexGrow: 1,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  header: { gap: 14 },
  listSeparator: { height: 12 },
  loaderCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    paddingVertical: 22,
    alignItems: 'center',
    gap: 10,
  },
  loaderText: { fontSize: 13, color: TEXT_MUTED },
  errorCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  errorBody: { flex: 1 },
  errorTitle: { fontSize: 14, fontWeight: '800', color: BRAND_BLUE_DARK },
  errorMessage: { fontSize: 12.5, color: TEXT_MUTED, marginTop: 2 },
  retryBtn: { borderRadius: 10 },
  retryBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND_BLUE,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryText: { fontSize: 12.5, fontWeight: '800', color: SURFACE },
  placeholderCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    alignItems: 'center',
    gap: 10,
  },
  placeholderIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: BRAND_BLUE_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    textAlign: 'center',
  },
  placeholderBody: {
    fontSize: 13.5,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 360,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    paddingLeft: 40,
    paddingRight: 40,
    minHeight: 48,
  },
  searchIcon: { position: 'absolute', left: 12, zIndex: 1 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: BRAND_BLUE_DARK,
    minHeight: 44,
    paddingVertical: 8,
  },
  searchClear: { position: 'absolute', right: 10, zIndex: 1 },
});
