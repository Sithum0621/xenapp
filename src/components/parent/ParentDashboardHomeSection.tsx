import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';

import { NativeFluidFlatList } from '@/src/components/layout/NativeFluidFlatList';
import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';

import AnimatedCard from '@/src/components/parent/AnimatedCard';
import AttendanceCard from '@/src/components/parent/AttendanceCard';
import ExamsCard from '@/src/components/parent/ExamsCard';
import GamesTile from '@/src/components/parent/GamesTile';
import MyClassCardButton from '@/src/components/parent/MyClassCardButton';
import WalletBalanceTile from '@/src/components/parent/WalletBalanceTile';
import StudentSwitcher from '@/src/components/parent/StudentSwitcher';
import TodayScheduleCard from '@/src/components/parent/TodayScheduleCard';
import type { ParentLinkedStudent } from '@/src/services/parentStudentsApi';
import { Text } from '@/src/theme/Text';

import {
  parentBorder,
  parentBrandBlue,
  parentBrandBlueDark,
  parentInkSoft,
  parentSurface,
} from '@/src/theme/parentDashboardPalette';

const BRAND_BLUE = parentBrandBlue;
const BRAND_BLUE_DARK = parentBrandBlueDark;
const TEXT_MUTED = parentInkSoft;
const BORDER = parentBorder;
const SURFACE = parentSurface;

export type ParentDashboardHomeSectionProps = {
  isVisible: boolean;
  /** Skip staggered card animations when returning to the home tab. */
  skipEntranceAnimation?: boolean;
  studentsLoading: boolean;
  studentsError: string | null;
  students: ParentLinkedStudent[];
  selectedStudentId: string | null;
  selectedStudent: ParentLinkedStudent | null;
  onSelectStudent: (studentUserId: string) => void;
  onAddStudent: () => void;
  onRetryStudents: () => void;
  onOpenGames?: () => void;
  contentPaddingBottom?: number;
};

function ParentDashboardHomeSection({
  isVisible,
  skipEntranceAnimation = false,
  studentsLoading,
  studentsError,
  students,
  selectedStudentId,
  selectedStudent,
  onSelectStudent,
  onAddStudent,
  onRetryStudents,
  onOpenGames,
  contentPaddingBottom = 0,
}: ParentDashboardHomeSectionProps) {
  const { t } = useTranslation();

  const homeBody = useMemo(() => {
    if (studentsLoading) {
      return (
        <View style={styles.sectionBody}>
          <View style={styles.inlineLoader}>
            <ActivityIndicator size="small" color={BRAND_BLUE} />
            <Text style={styles.inlineLoaderText}>{t('parentDashboard.studentsLoading')}</Text>
          </View>
        </View>
      );
    }

    if (studentsError) {
      return (
        <View style={styles.sectionBody}>
          <View style={styles.inlineErrorCard}>
            <Ionicons name="alert-circle-outline" size={18} color="#B42318" />
            <View style={styles.inlineErrorBody}>
              <Text style={styles.inlineErrorTitle}>{t('parentDashboard.studentsErrorTitle')}</Text>
              <Text style={styles.inlineErrorMsg} numberOfLines={3}>
                {studentsError}
              </Text>
            </View>
            <ScrollFriendlyPressable
              accessibilityRole="button"
              onPress={onRetryStudents}
              style={styles.retryBtn}
              innerStyle={styles.retryBtnInner}>
              <Ionicons name="refresh" size={14} color="#FFFFFF" />
              <Text style={styles.retryText}>{t('parentDashboard.classesRetry')}</Text>
            </ScrollFriendlyPressable>
          </View>
        </View>
      );
    }

    if (students.length === 0) {
      return (
        <View style={styles.sectionBody}>
          <AnimatedCard delay={80} instant={skipEntranceAnimation}>
            <View style={styles.emptyStateCard}>
              <View style={styles.placeholderIconWrap}>
                <Ionicons name="people-outline" size={26} color={BRAND_BLUE} />
              </View>
              <Text style={styles.placeholderTitle}>{t('parentDashboard.studentsEmptyTitle')}</Text>
              <Text style={styles.placeholderBody}>{t('parentDashboard.studentsEmptyBody')}</Text>
              <ScrollFriendlyPressable
                accessibilityRole="button"
                onPress={onAddStudent}
                style={styles.primaryActionBtn}
                innerStyle={styles.primaryActionBtnInner}>
                <Ionicons name="person-add-outline" size={16} color="#FFFFFF" />
                <Text style={styles.primaryActionBtnText}>
                  {t('parentDashboard.studentSwitcherAdd')}
                </Text>
              </ScrollFriendlyPressable>
            </View>
          </AnimatedCard>
        </View>
      );
    }

    return (
      <View style={styles.sectionBody}>
        <AnimatedCard delay={60} instant={skipEntranceAnimation}>
          <StudentSwitcher
            students={students}
            selectedId={selectedStudentId}
            onSelect={onSelectStudent}
            onAdd={onAddStudent}
          />
        </AnimatedCard>
        <AnimatedCard delay={100} instant={skipEntranceAnimation}>
          <MyClassCardButton studentUserId={selectedStudentId} />
        </AnimatedCard>
        <AnimatedCard delay={140} instant={skipEntranceAnimation}>
          <TodayScheduleCard studentUserId={selectedStudentId} isActive={isVisible} />
        </AnimatedCard>
        <View style={styles.tileRow}>
          <AnimatedCard delay={180} instant={skipEntranceAnimation} style={styles.tileCol}>
            <AttendanceCard studentUserId={selectedStudentId} />
          </AnimatedCard>
          <AnimatedCard delay={220} instant={skipEntranceAnimation} style={styles.tileCol}>
            <GamesTile studentUserId={selectedStudentId} onPress={onOpenGames} />
          </AnimatedCard>
        </View>
        <View style={styles.tileRow}>
          <AnimatedCard delay={260} instant={skipEntranceAnimation} style={styles.tileCol}>
            <ExamsCard />
          </AnimatedCard>
          <AnimatedCard delay={300} instant={skipEntranceAnimation} style={styles.tileCol}>
            <WalletBalanceTile studentUserId={selectedStudentId} />
          </AnimatedCard>
        </View>
      </View>
    );
  }, [
    studentsLoading,
    studentsError,
    students,
    skipEntranceAnimation,
    t,
    onRetryStudents,
    onAddStudent,
    selectedStudentId,
    onSelectStudent,
    isVisible,
    onOpenGames,
  ]);

  const listHeader = useMemo(() => homeBody, [homeBody]);

  if (!isVisible) return null;

  return (
    <NativeFluidFlatList
      style={styles.flex1}
      data={[]}
      renderItem={() => null}
      keyExtractor={() => 'home'}
      ListHeaderComponent={listHeader}
      contentContainerStyle={[styles.listContent, { paddingBottom: contentPaddingBottom }]}
    />
  );
}

export default memo(ParentDashboardHomeSection);

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    flexGrow: 1,
  },
  sectionBody: { gap: 14, pointerEvents: 'box-none' },
  tileRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  tileCol: { flex: 1 },
  inlineLoader: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  inlineLoaderText: { fontSize: 13, color: TEXT_MUTED, fontWeight: '600' },
  inlineErrorCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inlineErrorBody: { flex: 1, gap: 2 },
  inlineErrorTitle: { fontSize: 14, fontWeight: '800', color: BRAND_BLUE_DARK },
  inlineErrorMsg: { fontSize: 12.5, color: TEXT_MUTED },
  retryBtn: { borderRadius: 8 },
  retryBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: parentBrandBlue,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  retryText: { fontSize: 11.5, fontWeight: '800', color: '#FFFFFF' },
  emptyStateCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    paddingVertical: 26,
    paddingHorizontal: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    alignItems: 'center',
    gap: 12,
  },
  primaryActionBtn: { borderRadius: 12, marginTop: 4 },
  primaryActionBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: parentBrandBlue,
  },
  primaryActionBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  placeholderIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(46, 84, 148, 0.08)',
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
});
