import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import DashboardScreenShell from '@/src/components/layout/DashboardScreenShell';
import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import { useSessionCachedQuery } from '@/src/hooks/useSessionCachedQuery';
import { SessionCacheKeys } from '@/src/services/sessionDataCache';
import {
  fetchTeacherDashboardOverview,
  type TeacherDashboardClassRow,
} from '@/src/services/teacherDashboardApi';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { FontFamily } from '@/src/theme/fonts';
import { PAGE_CONTENT_BOTTOM, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const TEXT_MUTED = '#64748B';
const BORDER = '#E2E8F0';
const SURFACE = '#FFFFFF';

const TEACHER_GROUP_MCQ_PATH = '/teacher-dashboard/group-detail/mcq';

export default function TeacherDigitalPapersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const td = (k: string, opts?: Record<string, unknown>) => t(`teacherDashboard.${k}`, opts);

  const [classQuery, setClassQuery] = useState('');
  const [classPickerOpen, setClassPickerOpen] = useState(false);

  const { data: overviewResult, loading: classesLoading } = useSessionCachedQuery(
    SessionCacheKeys.TEACHER_DASHBOARD_OVERVIEW,
    () => fetchTeacherDashboardOverview(),
    { shouldCache: (res) => !res.error && res.overview != null },
  );

  const classes = overviewResult?.overview?.classes ?? [];

  const classKey = (row: TeacherDashboardClassRow) => `${row.source}:${row.id}`;

  const filteredClasses = useMemo(() => {
    const q = classQuery.trim().toLowerCase();
    if (!q) return classes;
    return classes.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.instituteName ?? '').toLowerCase().includes(q),
    );
  }, [classes, classQuery]);

  const openClassMcq = (row: TeacherDashboardClassRow) => {
    setClassPickerOpen(false);
    router.push({
      pathname: TEACHER_GROUP_MCQ_PATH,
      params: {
        title: row.name,
        source: row.source,
        id: row.id,
      },
    } as never);
  };

  return (
    <DashboardScreenShell
      showBack
      title={td('digitalPapersTitle')}
      subtitle={td('digitalPapersPickClassSubtitle')}
      padContent={false}
      edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>{td('digitalPapersSelectClass')}</Text>
          <Text style={styles.sectionHint}>{td('digitalPapersSearchClassHint')}</Text>

          {classesLoading && classes.length === 0 ? (
            <View style={styles.inlineLoader}>
              <ActivityIndicator color={BRAND_BLUE} />
            </View>
          ) : (
            <View style={styles.comboWrap}>
              <View style={styles.comboInputWrap}>
                <Ionicons name="search-outline" size={18} color={TEXT_MUTED} style={styles.comboIcon} />
                <TextInput
                  value={classQuery}
                  onChangeText={(value) => {
                    setClassQuery(value);
                    setClassPickerOpen(true);
                  }}
                  onFocus={() => setClassPickerOpen(true)}
                  placeholder={td('digitalPapersSearchClassPlaceholder')}
                  placeholderTextColor={TEXT_MUTED}
                  accessibilityLabel={td('digitalPapersSelectClass')}
                  style={styles.comboInput}
                />
                {classQuery.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('teacherDashboard.overview.classesSearchClear')}
                    onPress={() => {
                      setClassQuery('');
                      setClassPickerOpen(true);
                    }}
                    hitSlop={8}
                    style={styles.comboClear}>
                    <Ionicons name="close-circle" size={18} color={TEXT_MUTED} />
                  </Pressable>
                ) : null}
              </View>

              {classPickerOpen && filteredClasses.length > 0 ? (
                <View style={styles.comboList}>
                  {filteredClasses.map((row) => (
                    <Pressable
                      key={classKey(row)}
                      accessibilityRole="button"
                      onPress={() => openClassMcq(row)}
                      style={({ pressed }) => [styles.comboItem, pressed && styles.comboItemPressed]}>
                      <Text style={styles.comboItemTitle} numberOfLines={2}>
                        {row.name}
                      </Text>
                      <Text style={styles.comboItemMeta}>
                        {td('digitalPapersStudentCount', { count: row.studentCount })}
                      </Text>
                      <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
                    </Pressable>
                  ))}
                </View>
              ) : classPickerOpen && classQuery.trim() && filteredClasses.length === 0 ? (
                <Text style={styles.emptyHint}>{t('teacherDashboard.overview.classesSearchEmptyTitle')}</Text>
              ) : null}
            </View>
          )}
        </View>
      </KeyboardAwareScrollView>
    </DashboardScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: 8,
    paddingBottom: PAGE_CONTENT_BOTTOM,
  },
  sectionBlock: { gap: 10 },
  sectionTitle: { fontSize: 16, fontFamily: FontFamily.bold, color: BRAND_BLUE_DARK },
  sectionHint: { fontSize: 13, lineHeight: 18, fontFamily: FontFamily.regular, color: TEXT_MUTED },
  inlineLoader: { paddingVertical: 24, alignItems: 'center' },
  comboWrap: { gap: 6 },
  comboInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: SURFACE,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  comboIcon: { marginRight: 8 },
  comboInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: FontFamily.regular,
    color: BRAND_BLUE_DARK,
    paddingVertical: 10,
  },
  comboClear: { padding: 4 },
  comboList: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: SURFACE,
    overflow: 'hidden',
  },
  comboItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  comboItemPressed: { backgroundColor: '#F1F5F9' },
  comboItemTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: FontFamily.semiBold,
    color: BRAND_BLUE_DARK,
  },
  comboItemMeta: { fontSize: 12, fontFamily: FontFamily.regular, color: TEXT_MUTED },
  emptyHint: {
    fontSize: 13,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
});
