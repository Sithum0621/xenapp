import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import DashboardPremiumTile from '@/src/components/parent/dashboard/DashboardPremiumTile';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { parentGamesPurple, parentInkSoft } from '@/src/theme/parentDashboardPalette';

export type GamesTileProps = {
  studentUserId: string | null;
  onPress?: () => void;
};

function GamesTile({ studentUserId, onPress }: GamesTileProps) {
  const { t } = useTranslation();

  const handlePress = () => {
    if (!studentUserId || !onPress) return;
    onPress();
  };

  return (
    <DashboardPremiumTile
      style={styles.tile}
      accent="games"
      title={t('parentDashboard.gamesTitle')}
      subtitle={t('parentDashboard.gamesComingSoonTitle')}
      accessibilityLabel={t('parentDashboard.gamesTitle')}
      disabled={!studentUserId || !onPress}
      onPress={handlePress}>
      <View style={styles.body}>
        <Text style={styles.soon}>{t('parentDashboard.gamesComingSoonTitle')}</Text>
        <Text style={styles.bodyText}>{t('parentDashboard.gamesComingSoonBody')}</Text>
      </View>
    </DashboardPremiumTile>
  );
}

export default memo(GamesTile);

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 196,
  },
  body: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  soon: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: parentGamesPurple,
    textAlign: 'center',
  },
  bodyText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
    textAlign: 'center',
  },
});
