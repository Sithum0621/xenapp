import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import TeacherGroupMcqPanel from '@/src/components/teacher/groupDetail/TeacherGroupMcqPanel';
import TeacherGroupSubScreenShell from '@/src/components/teacher/groupDetail/TeacherGroupSubScreenShell';
import { parseTeacherGroupParams } from '@/src/utils/teacherGroupRouteParams';

export default function TeacherGroupMcqScreen() {
  const params = useLocalSearchParams<{ title?: string; source?: string; id?: string }>();
  const ctx = parseTeacherGroupParams(params);
  const { t } = useTranslation();

  return (
    <TeacherGroupSubScreenShell sectionTitle={t('teacherDashboard.groupDetail.mcqTitle')}>
      <TeacherGroupMcqPanel ctx={ctx} />
    </TeacherGroupSubScreenShell>
  );
}
