import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import TeacherGroupStatsPanel from '@/src/components/teacher/groupDetail/TeacherGroupStatsPanel';
import TeacherGroupSubScreenShell from '@/src/components/teacher/groupDetail/TeacherGroupSubScreenShell';
import { parseTeacherGroupParams } from '@/src/utils/teacherGroupRouteParams';

export default function TeacherGroupStatsScreen() {
  const params = useLocalSearchParams<{ title?: string; source?: string; id?: string }>();
  const ctx = parseTeacherGroupParams(params);
  const { t } = useTranslation();

  return (
    <TeacherGroupSubScreenShell sectionTitle={t('teacherDashboard.groupDetail.statsTitle')}>
      <TeacherGroupStatsPanel ctx={ctx} />
    </TeacherGroupSubScreenShell>
  );
}
