import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import {
  fetchStudentLeaderboardSnapshot,
  type StudentLeaderboardSnapshot,
} from '@/src/services/studentLeaderboardApi';
import {
  parentGamesGold,
  parentGamesPurple,
  parentInk,
  parentInkMuted,
} from '@/src/theme/parentDashboardPalette';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';

const EMPTY_SNAPSHOT: StudentLeaderboardSnapshot = {
  inTop100: false,
  rank: null,
  aheadPercent: 0,
  bestSubject: 'General',
  totalScore: 0,
  participantCount: 0,
};

export type GamesRankSectionProps = {
  studentUserId: string | null;
};

/** Rank pill + best-subject chip — same block as inside the home Games card. */
function GamesRankSection({ studentUserId }: GamesRankSectionProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<StudentLeaderboardSnapshot>(EMPTY_SNAPSHOT);

  const load = useCallback(async () => {
    if (!studentUserId) {
      setSnapshot(EMPTY_SNAPSHOT);
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await fetchStudentLeaderboardSnapshot(studentUserId);
    if (res.ok) setSnapshot(res.snapshot);
    else setSnapshot(EMPTY_SNAPSHOT);
    setLoading(false);
  }, [studentUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rankLine =
    snapshot.inTop100 && snapshot.rank != null
      ? t('parentDashboard.gamesRank', { rank: snapshot.rank })
      : t('parentDashboard.gamesAhead', { percent: snapshot.aheadPercent ?? 0 });

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={parentGamesPurple} />
      </View>
    );
  }

  return (
    <View style={styles.body}>
      <View
        style={[
          styles.statPill,
          snapshot.inTop100 ? styles.statPillGold : styles.statPillPurple,
        ]}>
        <Ionicons
          name={snapshot.inTop100 ? 'trophy' : 'flash'}
          size={18}
          color={snapshot.inTop100 ? parentGamesGold : parentGamesPurple}
        />
        <Text style={styles.statText} numberOfLines={2}>
          {rankLine}
        </Text>
      </View>
      <View style={styles.subjectChip}>
        <Ionicons name="ribbon-outline" size={14} color={parentInk} />
        <Text style={styles.subjectText} numberOfLines={2}>
          {t('parentDashboard.gamesBestSubject', { subject: snapshot.bestSubject })}
        </Text>
      </View>
    </View>
  );
}

export default memo(GamesRankSection);

const styles = StyleSheet.create({
  loadingWrap: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    width: '100%',
    gap: 10,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  statPillGold: {
    backgroundColor: '#FBF6EA',
    borderColor: '#E8D9A8',
  },
  statPillPurple: {
    backgroundColor: '#F3EEF9',
    borderColor: '#D8CBEC',
  },
  statText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    fontFamily: FontFamily.bold,
    color: parentInk,
  },
  subjectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  subjectText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FontFamily.regular,
    color: parentInkMuted,
  },
});
