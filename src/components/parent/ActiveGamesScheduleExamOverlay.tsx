import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import GamesScheduleExamTimer from '@/src/components/parent/GamesScheduleExamTimer';
import { useActiveGamesScheduleExam } from '@/src/contexts/ActiveGamesScheduleExamContext';
import { appHref, hrefParentGamesScheduleEvent } from '@/src/navigation/AppNavigator';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import {
  parentBrandBlue,
  parentBrandBlueDark,
  parentGamesPurple,
  parentSurface,
} from '@/src/theme/parentDashboardPalette';

export type ActiveGamesScheduleExamOverlayProps = {
  visible: boolean;
  onDismiss?: () => void;
};

export default function ActiveGamesScheduleExamOverlay({
  visible,
  onDismiss,
}: ActiveGamesScheduleExamOverlayProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { activeExam, remainingSeconds } = useActiveGamesScheduleExam();

  if (!visible || !activeExam) return null;

  const returnToExam = () => {
    router.push(
      appHref(
        hrefParentGamesScheduleEvent(activeExam.student_user_id, activeExam.event_id),
      ),
    );
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        {onDismiss ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('parentDashboard.gamesScheduleActiveExamClose')}
            onPress={onDismiss}
            hitSlop={10}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}>
            <Ionicons name="close" size={16} color="#DC2626" />
          </Pressable>
        ) : null}
        <View style={styles.iconCircle}>
          <Ionicons name="game-controller" size={28} color={parentGamesPurple} />
        </View>
        <Text style={styles.title}>{t('parentDashboard.gamesScheduleActiveExamTitle')}</Text>
        <Text style={styles.body}>{t('parentDashboard.gamesScheduleActiveExamBody')}</Text>
        {activeExam.event_title ? (
          <Text style={styles.eventTitle} numberOfLines={2}>
            {activeExam.event_title}
          </Text>
        ) : null}
        {remainingSeconds > 0 ? (
          <GamesScheduleExamTimer
            remainingSeconds={remainingSeconds}
            label={t('parentDashboard.gamesScheduleExamTimerLabel')}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('parentDashboard.gamesScheduleActiveExamReturn')}
          onPress={returnToExam}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}>
          <Ionicons name="arrow-forward-circle" size={20} color="#FFFFFF" />
          <Text style={styles.ctaText}>
            {t('parentDashboard.gamesScheduleActiveExamReturn')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(7, 22, 53, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: parentSurface,
    borderRadius: 22,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(123, 107, 196, 0.18)',
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    zIndex: 1,
  },
  closeBtnPressed: {
    opacity: 0.75,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(123, 107, 196, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: FontFamily.black,
    color: parentBrandBlueDark,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FontFamily.regular,
    color: parentBrandBlueDark,
    textAlign: 'center',
    opacity: 0.88,
  },
  eventTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FontFamily.bold,
    color: parentGamesPurple,
    textAlign: 'center',
  },
  cta: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: parentBrandBlue,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignSelf: 'stretch',
  },
  ctaPressed: {
    opacity: 0.9,
  },
  ctaText: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FontFamily.bold,
    color: '#FFFFFF',
  },
});
