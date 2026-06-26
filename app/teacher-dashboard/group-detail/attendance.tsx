import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import TeacherGroupAttendancePanel from '@/src/components/teacher/groupDetail/TeacherGroupAttendancePanel';
import TeacherGroupSubScreenShell from '@/src/components/teacher/groupDetail/TeacherGroupSubScreenShell';
import { parseTeacherGroupParams } from '@/src/utils/teacherGroupRouteParams';

export default function TeacherGroupAttendanceScreen() {
  const params = useLocalSearchParams<{ title?: string; source?: string; id?: string }>();
  const ctx = parseTeacherGroupParams(params);
  const { t } = useTranslation();

  return (
    <TeacherGroupSubScreenShell sectionTitle={t('teacherDashboard.groupDetail.attendanceTitle')}>
      <TeacherGroupAttendancePanel ctx={ctx} />
    </TeacherGroupSubScreenShell>
  );
}
