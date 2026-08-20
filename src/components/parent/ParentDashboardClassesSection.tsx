import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, type RefreshControlProps, StyleSheet, View } from 'react-native';
import type { ReactElement } from 'react';

import ClassesStudentBillingHeader from '@/src/components/parent/ClassesStudentBillingHeader';
import StudentClassesPanel from '@/src/components/parent/StudentClassesPanel';
import type { ParentLinkedStudent } from '@/src/services/parentStudentsApi';
import { Text } from '@/src/theme/Text';
import { PAGE_CONTENT_TOP, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';
import { formatSriLankaMobileDisplay } from '@/src/utils/sriLankaMobile';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const TEXT_MUTED = '#64748B';

export type ParentDashboardClassesSectionProps = {
  isVisible: boolean;
  studentsLoading: boolean;
  selectedStudentId: string | null;
  selectedStudent: ParentLinkedStudent | null;
  classesRefreshNonce: number;
  contentPaddingBottom?: number;
  refreshControl?: ReactElement<RefreshControlProps>;
};

function ParentDashboardClassesSection({
  isVisible,
  studentsLoading,
  selectedStudentId,
  selectedStudent,
  classesRefreshNonce,
  contentPaddingBottom = 0,
  refreshControl,
}: ParentDashboardClassesSectionProps) {
  const { t } = useTranslation();

  const listHeader = useMemo(
    () => (
      <>
        <Text style={styles.sectionTitle}>{t('parentDashboard.navClasses')}</Text>
        <Text style={styles.sectionSub}>{t('parentDashboard.classesSubtitle')}</Text>

        {selectedStudentId && !studentsLoading ? (
          <ClassesStudentBillingHeader
            studentUserId={selectedStudentId}
            refreshNonce={classesRefreshNonce}
          />
        ) : null}

        {selectedStudent ? (
          <Text style={styles.classesViewingLine}>
            {selectedStudent.mobileNumber
              ? t('parentDashboard.classesViewingStudentWithXen', {
                  name: selectedStudent.fullName,
                  xen:
                    formatSriLankaMobileDisplay(selectedStudent.mobileNumber) ??
                    selectedStudent.mobileNumber,
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
    [t, selectedStudentId, studentsLoading, classesRefreshNonce, selectedStudent],
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
  flex1: { flex: 1, paddingHorizontal: PAGE_EDGE_INSET, paddingTop: PAGE_CONTENT_TOP },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  sectionSub: { fontSize: 14, color: TEXT_MUTED, marginBottom: 4 },
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
