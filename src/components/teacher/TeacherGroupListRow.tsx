import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';

import type { TeacherUnifiedGroupRow } from '@/src/services/teacherGroupsApi';
import { Text } from '@/src/theme/Text';

const BRAND_BLUE_DARK = '#00101F';
const BORDER = '#E2E8F0';
const PAGE_SURFACE = '#F8FAFC';

type Props = {
  item: TeacherUnifiedGroupRow;
  onOpen: (row: TeacherUnifiedGroupRow) => void;
};

function TeacherGroupListRow({ item, onOpen }: Props) {
  const { t } = useTranslation();

  const onOpenPress = useCallback(() => onOpen(item), [item, onOpen]);

  return (
    <ScrollFriendlyPressable
      accessibilityRole="button"
      accessibilityLabel={t('teacherDashboard.groupsOpenCardA11y', { name: item.name })}
      onPress={onOpenPress}
      style={styles.groupCard}
      innerStyle={styles.groupCardInner}>
      <View style={styles.groupCardBody}>
        <Text style={styles.groupName}>{item.name}</Text>
        <View style={styles.tagsRow}>
          {item.source === 'institute' ? (
            <>
              <View style={styles.tagPillInstitute}>
                <Text style={styles.tagPillInstituteText}>{t('teacherDashboard.groupsInstituteBadge')}</Text>
              </View>
              <View style={styles.tagPillInstituteName}>
                <Text style={styles.tagPillInstituteNameText} numberOfLines={1} ellipsizeMode="tail">
                  {item.institute_name?.trim()
                    ? item.institute_name.trim()
                    : t('teacherDashboard.groupsUnknownInstitute')}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.tagPillGroupClass}>
              <Text style={styles.tagPillGroupClassText}>
                {t('teacherDashboard.groupsGroupClassBadge')}
              </Text>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={22} color="#94A3B8" style={styles.chevron} />
    </ScrollFriendlyPressable>
  );
}

export default memo(TeacherGroupListRow);

const styles = StyleSheet.create({
  groupCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: PAGE_SURFACE,
    overflow: 'hidden',
  },
  groupCardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 14,
    width: '100%',
  },
  groupCardBody: {
    flex: 1,
    minWidth: 0,
    gap: 10,
  },
  groupName: { fontSize: 16, fontWeight: '800', color: BRAND_BLUE_DARK },
  chevron: {
    marginTop: 2,
    flexShrink: 0,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  tagPillInstitute: {
    flexShrink: 0,
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tagPillInstituteText: { fontSize: 11, fontWeight: '800', color: '#334155', textTransform: 'uppercase' },
  tagPillInstituteName: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
    alignSelf: 'flex-start',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  tagPillInstituteNameText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
    letterSpacing: 0.2,
  },
  tagPillGroupClass: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  tagPillGroupClassText: { fontSize: 11, fontWeight: '800', color: '#166534', textTransform: 'uppercase' },
});
