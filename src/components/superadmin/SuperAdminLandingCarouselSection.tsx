import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import {
  addLandingCarouselSlide,
  deleteLandingCarouselSlide,
  fetchLandingCarouselForSuperadmin,
  LANDING_CAROUSEL_MAX,
  reorderLandingCarouselSlide,
  type LandingCarouselSlide,
  uploadLandingCarouselImage,
} from '@/src/services/landingCarouselApi';
import { appAlert } from '@/src/utils/appAlert';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const TEXT_MUTED = '#64748B';
const SUBTLE_BORDER = '#E2E8F0';
const PANEL_BG = '#F8FAFC';
const DANGER = '#B91C1C';

type Props = {
  desktopShell?: boolean;
};

export default function SuperAdminLandingCarouselSection({ desktopShell }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [slides, setSlides] = useState<LandingCarouselSlide[]>([]);
  const [altText, setAltText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchLandingCarouselForSuperadmin();
    setLoading(false);
    if (!res.ok) {
      appAlert(t('superAdmin.landingCarouselAddFailTitle'), res.error);
      return;
    }
    setSlides(res.slides);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onPick = async () => {
    if (slides.filter((s) => s.isActive !== false).length >= LANDING_CAROUSEL_MAX) {
      appAlert(t('superAdmin.landingCarouselFullTitle'), t('superAdmin.landingCarouselFullBody'));
      return;
    }

    const picked = await DocumentPicker.getDocumentAsync({
      type: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    setUploading(true);
    const uploaded = await uploadLandingCarouselImage(
      asset.uri,
      asset.name || 'slide.jpg',
      asset.mimeType || undefined,
    );
    if (!uploaded.ok) {
      setUploading(false);
      appAlert(t('superAdmin.landingCarouselUploadFailTitle'), uploaded.error);
      return;
    }
    const added = await addLandingCarouselSlide({
      imagePath: uploaded.objectPath,
      publicUrl: uploaded.publicUrl,
      altText,
    });
    setUploading(false);
    if (!added.ok) {
      appAlert(t('superAdmin.landingCarouselAddFailTitle'), added.error);
      return;
    }
    setAltText('');
    await load();
  };

  const onDelete = (slide: LandingCarouselSlide) => {
    appAlert(
      t('superAdmin.landingCarouselDeleteTitle'),
      t('superAdmin.landingCarouselDeleteBody'),
      [
        { text: t('superAdmin.landingCarouselCancel'), style: 'cancel' },
        {
          text: t('superAdmin.landingCarouselDelete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyId(slide.id);
              const res = await deleteLandingCarouselSlide(slide.id);
              setBusyId(null);
              if (!res.ok) {
                appAlert(t('superAdmin.landingCarouselAddFailTitle'), res.error);
                return;
              }
              await load();
            })();
          },
        },
      ],
    );
  };

  const onMove = async (slide: LandingCarouselSlide, direction: 'up' | 'down') => {
    setBusyId(slide.id);
    const res = await reorderLandingCarouselSlide(slide.id, direction);
    setBusyId(null);
    if (!res.ok) {
      appAlert(t('superAdmin.landingCarouselAddFailTitle'), res.error);
      return;
    }
    await load();
  };

  return (
    <ScrollView
      style={desktopShell ? styles.desktopScroll : undefined}
      contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('superAdmin.landingCarouselTitle')}</Text>
      <Text style={styles.subtitle}>{t('superAdmin.landingCarouselSubtitle')}</Text>

      <View style={styles.panel}>
        <Text style={styles.label}>{t('superAdmin.landingCarouselAlt')}</Text>
        <TextInput
          value={altText}
          onChangeText={setAltText}
          placeholder={t('superAdmin.landingCarouselAltPlaceholder')}
          placeholderTextColor={TEXT_MUTED}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          disabled={uploading}
          onPress={() => void onPick()}
          style={({ pressed }) => [
            styles.primaryBtn,
            (pressed || uploading) && styles.pressed,
            uploading && styles.btnDisabled,
          ]}>
          {uploading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color="#FFF" />
              <Text style={styles.primaryBtnText}>{t('superAdmin.landingCarouselAdd')}</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.hint}>
          {t('superAdmin.landingCarouselHint', { max: LANDING_CAROUSEL_MAX, count: slides.length })}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={BRAND_BLUE} style={{ marginTop: 24 }} />
      ) : slides.length === 0 ? (
        <Text style={styles.empty}>{t('superAdmin.landingCarouselEmpty')}</Text>
      ) : (
        slides.map((slide, i) => (
          <View key={slide.id} style={styles.row}>
            <Image source={{ uri: slide.publicUrl }} style={styles.thumb} contentFit="cover" />
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {slide.altText || t('superAdmin.landingCarouselUntitled')}
              </Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                #{i + 1} · {slide.imagePath}
              </Text>
              <View style={styles.rowActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={busyId === slide.id || i === 0}
                  onPress={() => void onMove(slide, 'up')}
                  style={styles.iconBtn}>
                  <Ionicons name="arrow-up" size={18} color={BRAND_BLUE_DARK} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busyId === slide.id || i === slides.length - 1}
                  onPress={() => void onMove(slide, 'down')}
                  style={styles.iconBtn}>
                  <Ionicons name="arrow-down" size={18} color={BRAND_BLUE_DARK} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busyId === slide.id}
                  onPress={() => onDelete(slide)}
                  style={styles.iconBtn}>
                  {busyId === slide.id ? (
                    <ActivityIndicator size="small" color={DANGER} />
                  ) : (
                    <Ionicons name="trash-outline" size={18} color={DANGER} />
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  desktopScroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
    marginBottom: 8,
  },
  panel: {
    backgroundColor: PANEL_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    padding: 14,
    gap: 10,
  },
  label: { fontSize: 13, fontWeight: '700', color: BRAND_BLUE_DARK },
  input: {
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFF',
    color: BRAND_BLUE_DARK,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BRAND_BLUE,
    borderRadius: 10,
    paddingVertical: 12,
  },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.7 },
  pressed: { opacity: 0.88 },
  hint: { fontSize: 12, color: TEXT_MUTED },
  empty: { marginTop: 16, color: TEXT_MUTED, fontSize: 14 },
  row: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#FFF',
  },
  thumb: { width: 88, height: 64, borderRadius: 8, backgroundColor: PANEL_BG },
  rowBody: { flex: 1, minWidth: 0, gap: 4 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: BRAND_BLUE_DARK },
  rowMeta: { fontSize: 12, color: TEXT_MUTED },
  rowActions: { flexDirection: 'row', gap: 4, marginTop: 4 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
