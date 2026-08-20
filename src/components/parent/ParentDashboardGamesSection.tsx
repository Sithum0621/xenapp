import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import DashboardPremiumTile from '@/src/components/parent/dashboard/DashboardPremiumTile';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { PAGE_CONTENT_TOP, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';
import { parentInkSoft } from '@/src/theme/parentDashboardPalette';

const TEXT_MUTED = parentInkSoft;

export type ParentDashboardGamesSectionProps = {
  isVisible: boolean;
  studentsLoading: boolean;
  selectedStudentId: string | null;
  contentPaddingBottom?: number;
};

function ParentDashboardGamesSection({
  isVisible,
  contentPaddingBottom = 0,
}: ParentDashboardGamesSectionProps) {
  const { t } = useTranslation();

  if (!isVisible) return null;

  return (
    <View style={[styles.wrap, { paddingBottom: contentPaddingBottom }]}>
      <DashboardPremiumTile
        accent="games"
        title={t('parentDashboard.gamesTitle')}
        subtitle={t('parentDashboard.gamesComingSoonTitle')}>
        <Text style={styles.body}>{t('parentDashboard.gamesComingSoonBody')}</Text>
      </DashboardPremiumTile>
    </View>
  );
}

export default memo(ParentDashboardGamesSection);

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: PAGE_CONTENT_TOP,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    textAlign: 'center',
    paddingVertical: 12,
  },
});
