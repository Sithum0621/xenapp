import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/theme/Text';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const PAGE_BG = '#FFFFFF';
const SUBTLE_BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';

type Props = {
  newOrdersCount: number;
  onPress: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
};

export default function SuperAdminCardOrdersDashboardTile({ newOrdersCount, onPress, t }: Props) {
  const hasNew = newOrdersCount > 0;
  const countLabel = newOrdersCount > 99 ? '99+' : String(newOrdersCount);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('superAdmin.cardOrdersButton')}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}>
      <View style={styles.iconWrap}>
        <Ionicons name="card-outline" size={20} color={BRAND_BLUE} />
      </View>

      <View style={styles.textWrap}>
        <Text style={styles.title}>{t('superAdmin.cardOrdersButton')}</Text>
        <Text style={[styles.subline, hasNew && styles.sublineActive]}>
          {hasNew
            ? t('superAdmin.cardOrdersNewCount', { count: newOrdersCount })
            : t('superAdmin.cardOrdersNoNew')}
        </Text>
      </View>

      <View style={[styles.countWrap, hasNew && styles.countWrapActive]}>
        <Text style={[styles.countValue, hasNew && styles.countValueActive]}>{countLabel}</Text>
        <Text style={[styles.countLabel, hasNew && styles.countLabelActive]}>
          {t('superAdmin.cardOrdersNewShort')}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color={TEXT_MUTED} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'flex-start',
    width: '100%',
    maxWidth: 420,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PAGE_BG,
  },
  tilePressed: {
    opacity: 0.9,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  subline: {
    fontSize: 12,
    color: TEXT_MUTED,
    lineHeight: 16,
  },
  sublineActive: {
    color: '#B45309',
    fontWeight: '600',
  },
  countWrap: {
    minWidth: 44,
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  countWrapActive: {
    backgroundColor: '#DC2626',
  },
  countValue: {
    fontSize: 18,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    lineHeight: 22,
  },
  countValueActive: {
    color: '#FFFFFF',
  },
  countLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  countLabelActive: {
    color: '#FEE2E2',
  },
});
