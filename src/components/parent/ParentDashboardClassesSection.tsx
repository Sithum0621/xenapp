import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, type RefreshControlProps, StyleSheet, View } from 'react-native';
import type { ReactElement } from 'react';

import ClassesStudentBillingHeader from '@/src/components/parent/ClassesStudentBillingHeader';
import StudentClassesPanel from '@/src/components/parent/StudentClassesPanel';
import StudentSwitcher from '@/src/components/parent/StudentSwitcher';
import type { ParentLinkedStudent } from '@/src/services/parentStudentsApi';
import { Text } from '@/src/theme/Text';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const TEXT_MUTED = '#64748B';

export type ParentDashboardClassesSectionProps = {
  isVisible: boolean;
  students: ParentLinkedStudent[];
  studentsLoading: boolean;
  selectedStudentId: string | null;
  selectedStudent: ParentLinkedStudent | null;
  classesRefreshNonce: number;
  onSelectStudent: (studentUserId: string) => void;
  onAddStudent: () => void;
  contentPaddingBottom?: number;
  refreshControl?: ReactElement<RefreshControlProps>;
};

function ParentDashboardClassesSection({
  isVisible,
  students,
  studentsLoading,
  selectedStudentId,
  selectedStudent,
  classesRefreshNonce,
  onSelectStudent,
  onAddStudent,
  contentPaddingBottom = 0,
  refreshControl,
}: ParentDashboardClassesSectionProps) {
  const { t } = useTranslation();

  const listHeader = useMemo(
    () => (
      <>
        <Text style={styles.sectionTitle}>{t('parentDashboard.navClasses')}</Text>
        <Text style={styles.sectionSub}>{t('parentDashboard.classesSubtitle')}</Text>

        {students.length > 0 ? (
          <View style={styles.classesSwitcherWrap}>
            <StudentSwitcher
              students={students}
              selectedId={selectedStudentId}
              onSelect={onSelectStudent}
              onAdd={onAddStudent}
            />
          </View>
        ) : null}

        {selectedStudentId && !studentsLoading ? (
          <ClassesStudentBillingHeader
            studentUserId={selectedStudentId}
            refreshNonce={classesRefreshNonce}
          />
        ) : null}

        {selectedStudent ? (
          <Text style={styles.classesViewingLine}>
            {selectedStudent.xenStudentId
              ? t('parentDashboard.classesViewingStudentWithXen', {
                  name: selectedStudent.fullName,
                  xen: selectedStudent.xenStudentId,
                })
              : t('parentDashboard.classesViewingStudent', { name: selectedStudent.fullName })}
          </Text>
        ) : null}

        {studentsLoading || !selectedStudentId ? (
          <View style={styles.classesLoadingWrap}>
            <ActivityIndicator size="small" color={BRAND_BLUE} />
            <Text style={styles.classesLoadingText}>{t('parentDashboard.classesLoading')}</Text>
          </View>
        ) : null}
      </>
    ),
    [
      t,
      students,
      selectedStudentId,
      onSelectStudent,
      onAddStudent,
      studentsLoading,
      classesRefreshNonce,
      selectedStudent,
    ],
  );

  if (!isVisible) return null;

  if (studentsLoading || !selectedStudentId) {
    return <View style={styles.flex1}>{listHeader}</View>;
  }

  return (
    <StudentClassesPanel
      studentUserId={selectedStudentId}
      isTabActive={isVisible}
      refreshNonce={classesRefreshNonce}
      emptyTitle={t('parentDashboard.classesEmptyTitle')}
      emptyBody={t('parentDashboard.classesEmptyBody')}
      listHeader={listHeader}
      contentPaddingBottom={contentPaddingBottom}
      refreshControl={refreshControl}
    />
  );
}

export default memo(ParentDashboardClassesSection);

const styles = StyleSheet.create({
  flex1: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  sectionSub: { fontSize: 14, color: TEXT_MUTED, marginBottom: 4 },
  classesSwitcherWrap: { marginBottom: 12 },
  classesViewingLine: {
    fontSize: 13,
    color: TEXT_MUTED,
    fontWeight: '600',
    marginBottom: 12,
  },
  classesLoadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  classesLoadingText: { fontSize: 14, color: TEXT_MUTED },
});
