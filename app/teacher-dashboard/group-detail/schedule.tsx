import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import TeacherGroupSchedulePanel from '@/src/components/teacher/groupDetail/TeacherGroupSchedulePanel';
import TeacherGroupSubScreenShell from '@/src/components/teacher/groupDetail/TeacherGroupSubScreenShell';
import { parseTeacherGroupParams } from '@/src/utils/teacherGroupRouteParams';

export default function TeacherGroupScheduleScreen() {
  const params = useLocalSearchParams<{ title?: string; source?: string; id?: string }>();
  const ctx = parseTeacherGroupParams(params);
  const { t } = useTranslation();

  return (
    <TeacherGroupSubScreenShell sectionTitle={t('teacherDashboard.groupDetail.scheduleTitle')}>
      <TeacherGroupSchedulePanel ctx={ctx} />
    </TeacherGroupSubScreenShell>
  );
}
