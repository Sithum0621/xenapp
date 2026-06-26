import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import TeacherGroupStudentsPanel from '@/src/components/teacher/groupDetail/TeacherGroupStudentsPanel';
import TeacherGroupSubScreenShell from '@/src/components/teacher/groupDetail/TeacherGroupSubScreenShell';
import { parseTeacherGroupParams } from '@/src/utils/teacherGroupRouteParams';

export default function TeacherGroupStudentsScreen() {
  const params = useLocalSearchParams<{ title?: string; source?: string; id?: string }>();
  const ctx = parseTeacherGroupParams(params);
  const { t } = useTranslation();

  return (
    <TeacherGroupSubScreenShell sectionTitle={t('teacherDashboard.groupDetail.studentsTitle')}>
      <TeacherGroupStudentsPanel ctx={ctx} />
    </TeacherGroupSubScreenShell>
  );
}
