import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import GamesRankSection from '@/src/components/parent/GamesRankSection';
import DashboardPremiumTile from '@/src/components/parent/dashboard/DashboardPremiumTile';

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
      subtitle={t('parentDashboard.gamesSubtitle')}
      accessibilityLabel={t('parentDashboard.gamesTitle')}
      disabled={!studentUserId || !onPress}
      onPress={handlePress}>
      <GamesRankSection studentUserId={studentUserId} />
    </DashboardPremiumTile>
  );
}

export default memo(GamesTile);

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 196,
  },
});
