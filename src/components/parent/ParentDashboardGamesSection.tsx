import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import GamesRankSection from '@/src/components/parent/GamesRankSection';
import GamesScheduleEventsList from '@/src/components/parent/GamesScheduleEventsList';
import DashboardPremiumTile from '@/src/components/parent/dashboard/DashboardPremiumTile';
import StudentSwitcher from '@/src/components/parent/StudentSwitcher';
import type { ParentLinkedStudent } from '@/src/services/parentStudentsApi';
import { Text } from '@/src/theme/Text';
import { parentBrandBlue, parentInkSoft } from '@/src/theme/parentDashboardPalette';

const TEXT_MUTED = parentInkSoft;

export type ParentDashboardGamesSectionProps = {
  isVisible: boolean;
  students: ParentLinkedStudent[];
  studentsLoading: boolean;
  selectedStudentId: string | null;
  onSelectStudent: (studentUserId: string) => void;
  onAddStudent: () => void;
  contentPaddingBottom?: number;
};

function ParentDashboardGamesSection({
  isVisible,
  students,
  studentsLoading,
  selectedStudentId,
  onSelectStudent,
  onAddStudent,
  contentPaddingBottom = 0,
}: ParentDashboardGamesSectionProps) {
  const { t } = useTranslation();

  const listHeader = useMemo(
    () => (
      <>
        {students.length > 0 ? (
          <View style={styles.switcherWrap}>
            <StudentSwitcher
              students={students}
              selectedId={selectedStudentId}
              onSelect={onSelectStudent}
              onAdd={onAddStudent}
            />
          </View>
        ) : null}

        {studentsLoading || !selectedStudentId ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color={parentBrandBlue} />
            <Text style={styles.muted}>{t('parentDashboard.gamesLoading')}</Text>
          </View>
        ) : (
          <DashboardPremiumTile
            accent="games"
            title={t('parentDashboard.gamesTitle')}
            subtitle={t('parentDashboard.gamesSubtitle')}>
            <GamesRankSection studentUserId={selectedStudentId} />
          </DashboardPremiumTile>
        )}
      </>
    ),
    [students, selectedStudentId, onSelectStudent, onAddStudent, studentsLoading, t],
  );

  if (!isVisible) return null;

  if (studentsLoading || !selectedStudentId) {
    return <View style={styles.flex1}>{listHeader}</View>;
  }

  return (
    <GamesScheduleEventsList
      studentUserId={selectedStudentId}
      listHeader={listHeader}
      contentPaddingBottom={contentPaddingBottom}
    />
  );
}

export default memo(ParentDashboardGamesSection);

const styles = StyleSheet.create({
  flex1: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  switcherWrap: { marginBottom: 4 },
  centered: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  muted: { fontSize: 14, color: TEXT_MUTED },
});
