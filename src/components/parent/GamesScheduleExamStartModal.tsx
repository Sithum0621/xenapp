import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';

import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import {
  parentBrandBlue,
  parentBrandBlueDark,
  parentInk,
  parentInkSoft,
  parentSurface,
} from '@/src/theme/parentDashboardPalette';

export type GamesScheduleExamStartModalProps = {
  visible: boolean;
  durationLabel: string;
  onStart: () => void;
  onLater: () => void;
};

export default function GamesScheduleExamStartModal({
  visible,
  durationLabel,
  onStart,
  onLater,
}: GamesScheduleExamStartModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onLater}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="timer-outline" size={24} color={parentBrandBlue} />
          </View>

          <Text style={styles.title}>{t('parentDashboard.gamesScheduleExamStartTitle')}</Text>

          <ScrollView
            style={styles.messageScroll}
            contentContainerStyle={styles.messageScrollContent}
            showsVerticalScrollIndicator={false}>
            <Text style={styles.message}>
              {t('parentDashboard.gamesScheduleExamStartIntro', { duration: durationLabel })}
            </Text>
            <Text style={styles.specialNote}>
              {t('parentDashboard.gamesScheduleExamStartSpecialNote')}
            </Text>
            <Text style={styles.goodLuck}>{t('parentDashboard.gamesScheduleExamStartGoodLuck')}</Text>
          </ScrollView>

          <View style={styles.actionsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('parentDashboard.gamesScheduleExamStartLater')}
              onPress={onLater}
              style={({ pressed }) => [styles.laterBtn, pressed && styles.laterBtnPressed]}>
              <Text style={styles.laterBtnText}>
                {t('parentDashboard.gamesScheduleExamStartLater')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('parentDashboard.gamesScheduleExamStartLetsGo')}
              onPress={onStart}
              style={({ pressed }) => [styles.startBtn, pressed && styles.startBtnPressed]}>
              <Text style={styles.startBtnText}>
                {t('parentDashboard.gamesScheduleExamStartLetsGo')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 22, 53, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '82%',
    backgroundColor: parentSurface,
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 22,
    gap: 14,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(18, 59, 122, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: FontFamily.bold,
    color: parentBrandBlueDark,
    textAlign: 'center',
  },
  messageScroll: {
    maxHeight: 280,
  },
  messageScrollContent: {
    gap: 12,
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: FontFamily.regular,
    color: parentInk,
  },
  specialNote: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: FontFamily.bold,
    color: parentBrandBlueDark,
  },
  goodLuck: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: FontFamily.regular,
    color: parentInkSoft,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  laterBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    backgroundColor: parentSurface,
    alignItems: 'center',
  },
  laterBtnPressed: { opacity: 0.75 },
  laterBtnText: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: parentBrandBlueDark,
  },
  startBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: parentBrandBlue,
    alignItems: 'center',
  },
  startBtnPressed: { opacity: 0.9 },
  startBtnText: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: '#FFFFFF',
  },
});
