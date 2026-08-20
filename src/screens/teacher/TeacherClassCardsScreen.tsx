import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import DashboardScreenShell from '@/src/components/layout/DashboardScreenShell';
import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import TeacherClassCardA4SheetPreview from '@/src/components/teacher/TeacherClassCardA4SheetPreview';
import TeacherClassCardDefaultPreview, {
  TeacherClassCardQrZoneOverlay,
} from '@/src/components/teacher/TeacherClassCardDefaultPreview';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import {
  loadTeacherClassCardPdfFiles,
  saveTeacherClassCardPdfFile,
  type TeacherClassCardPdfFile,
} from '@/src/services/teacherClassCardPdfFilesStore';
import {
  generateTeacherClassCardSheetPdf,
  shareClassCardPdf,
} from '@/src/services/teacherClassCardSheetPdf';
import { mintTeacherClassCardTokens, type IssuedClassCard } from '@/src/services/teacherClassCardTokenApi';
import {
  loadTeacherClassCardTemplate,
  removeTeacherClassCardSide,
  saveTeacherClassCardSide,
  type TeacherClassCardSide,
} from '@/src/services/teacherClassCardTemplateApi';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { PAGE_CONTENT_BOTTOM, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';
import { appAlert } from '@/src/utils/appAlert';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const TEXT_MUTED = '#64748B';
const BORDER = '#E2E8F0';
const SURFACE = '#FFFFFF';
const CARD_ASPECT = 1.586;
const GENERATE_BATCH = 4;
const MAX_PAGES = 20;

type ScreenView = 'home' | 'design';

export default function TeacherClassCardsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const ov = (k: string, opts?: Record<string, unknown>) =>
    t(`teacherDashboard.overview.${k}`, opts);
  const [view, setView] = useState<ScreenView>('home');

  return (
    <DashboardScreenShell
      showBack
      title={view === 'design' ? ov('ownClassCardsAddNewDesign') : ov('ownClassCardsTitle')}
      onBack={() => {
        if (view === 'design') {
          setView('home');
          return;
        }
        router.replace(appHref(AppRoutes.teacherDashboard));
      }}
      padContent={false}>
      {view === 'home' ? (
        <HomeView ov={ov} onAddDesign={() => setView('design')} />
      ) : (
        <DesignEditor ov={ov} />
      )}
    </DashboardScreenShell>
  );
}

function HomeView({
  ov,
  onAddDesign,
}: {
  ov: (k: string, opts?: Record<string, unknown>) => string;
  onAddDesign: () => void;
}) {
  const [pages, setPages] = useState(1);
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [issuedCards, setIssuedCards] = useState<IssuedClassCard[]>([]);
  const [pdfFiles, setPdfFiles] = useState<TeacherClassCardPdfFile[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [template, files] = await Promise.all([
        loadTeacherClassCardTemplate(),
        loadTeacherClassCardPdfFiles(),
      ]);
      if (cancelled) return;
      if (template.ok) {
        setFrontUrl(template.template.frontUrl);
        setBackUrl(template.template.backUrl);
      }
      setPdfFiles(files);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalCards = pages * GENERATE_BATCH;
  const changePages = (delta: number) => {
    setPages((prev) => Math.min(MAX_PAGES, Math.max(1, prev + delta)));
  };

  const downloadPdfFile = async (file: TeacherClassCardPdfFile) => {
    setDownloadingId(file.id);
    const res = await generateTeacherClassCardSheetPdf({
      pages: file.pages,
      frontUrl,
      backUrl,
      qrLabel: ov('ownClassCardsQrZone'),
      title: file.fileName,
      qrUrls: file.qrUrls,
    });
    setDownloadingId(null);
    if (!res.ok) {
      appAlert(ov('ownClassCardsTitle'), res.error || ov('ownClassCardsPdfFail'));
      return;
    }
    if (res.fileUri) {
      const shared = await shareClassCardPdf(res.fileUri, file.fileName);
      if (!shared) {
        appAlert(ov('ownClassCardsTitle'), ov('ownClassCardsPdfFail'));
      }
    }
  };

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ov('ownClassCardsAddNewDesign')}
        onPress={onAddDesign}
        style={({ pressed }) => [styles.hubBtn, pressed && styles.hubBtnPressed]}>
        <View style={styles.hubIcon}>
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </View>
        <Text style={styles.hubBtnText}>{ov('ownClassCardsAddNewDesign')}</Text>
      </Pressable>

      <View style={styles.hubBtnSecondaryStatic}>
        <View style={[styles.hubIcon, styles.hubIconSecondary]}>
          <Ionicons name="layers-outline" size={20} color={BRAND_BLUE} />
        </View>
        <View style={styles.generateCopy}>
          <Text style={styles.hubBtnTextSecondary}>{ov('ownClassCardsGenerate')}</Text>
          <Text style={styles.generateHint}>
            {ov('ownClassCardsGenerateHint', { count: GENERATE_BATCH })}
          </Text>
        </View>
      </View>

      <Text style={styles.intro}>{ov('ownClassCardsGenerateSheetHint')}</Text>

      <View style={styles.generateLayout}>
        <View style={styles.sheetCol}>
          {previewReady ? (
            <>
              <Text style={styles.previewLabel}>{ov('ownClassCardsGeneratePreviewLabel')}</Text>
              <TeacherClassCardA4SheetPreview
                frontUrl={frontUrl}
                backUrl={backUrl}
                qrZoneLabel={ov('ownClassCardsQrZone')}
                qrUrls={issuedCards.slice(0, GENERATE_BATCH).map((card) => card.qrUrl)}
              />
            </>
          ) : (
            <View style={styles.previewPlaceholder}>
              <Text style={styles.previewPlaceholderText}>
                {ov('ownClassCardsGenerateAwaiting')}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.controlsCol}>
          <Text style={styles.controlLabel}>{ov('ownClassCardsGeneratePages')}</Text>
          <View style={styles.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ov('ownClassCardsGenerateMinus')}
              onPress={() => changePages(-1)}
              disabled={pages <= 1}
              style={({ pressed }) => [
                styles.stepBtn,
                pressed && pages > 1 && styles.hubBtnPressed,
                pages <= 1 && styles.addBtnDisabled,
              ]}>
              <Ionicons name="remove" size={18} color={BRAND_BLUE_DARK} />
            </Pressable>
            <Text style={styles.stepValue}>{pages}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ov('ownClassCardsGeneratePlus')}
              onPress={() => changePages(1)}
              disabled={pages >= MAX_PAGES}
              style={({ pressed }) => [
                styles.stepBtn,
                pressed && pages < MAX_PAGES && styles.hubBtnPressed,
                pages >= MAX_PAGES && styles.addBtnDisabled,
              ]}>
              <Ionicons name="add" size={18} color={BRAND_BLUE_DARK} />
            </Pressable>
          </View>
          <Text style={styles.controlLabel}>{ov('ownClassCardsGenerateTotal')}</Text>
          <Text style={styles.totalValue}>{totalCards}</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={generateBusy}
        onPress={() => {
          void (async () => {
            setGenerateBusy(true);
            try {
              const minted = await mintTeacherClassCardTokens(totalCards);
              if (!minted.ok) {
                appAlert(ov('ownClassCardsTitle'), minted.error || ov('ownClassCardsQrMintFail'));
                return;
              }
              const saved = await saveTeacherClassCardPdfFile({
                pages,
                cardCount: totalCards,
                qrUrls: minted.cards.map((card) => card.qrUrl),
              });
              if (!saved.ok) {
                appAlert(ov('ownClassCardsTitle'), saved.error);
                return;
              }
              setIssuedCards(minted.cards);
              setPreviewReady(true);
              setPdfFiles((prev) => [saved.file, ...prev.filter((f) => f.id !== saved.file.id)]);
            } catch (e) {
              appAlert(
                ov('ownClassCardsTitle'),
                e instanceof Error ? e.message : ov('ownClassCardsQrMintFail'),
              );
            } finally {
              setGenerateBusy(false);
            }
          })();
        }}
        style={({ pressed }) => [
          styles.hubBtn,
          pressed && !generateBusy && styles.hubBtnPressed,
          generateBusy && styles.addBtnDisabled,
        ]}>
        {generateBusy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Ionicons name="grid-outline" size={18} color="#FFFFFF" />
        )}
        <Text style={styles.hubBtnText}>{ov('ownClassCardsGenerateAction')}</Text>
      </Pressable>

      <View style={styles.filesSection}>
        <Text style={styles.previewLabel}>{ov('ownClassCardsGeneratedFiles')}</Text>
        {pdfFiles.length === 0 ? (
          <Text style={styles.filesEmpty}>{ov('ownClassCardsGeneratedFilesEmpty')}</Text>
        ) : (
          pdfFiles.map((file) => {
            const created = new Date(file.createdAt);
            const when = Number.isNaN(created.getTime()) ? file.createdAt : created.toLocaleString();
            const busy = downloadingId === file.id;
            return (
              <View key={file.id} style={styles.fileRow}>
                <View style={styles.fileIcon}>
                  <Ionicons name="document-text-outline" size={22} color={BRAND_BLUE} />
                </View>
                <View style={styles.fileCopy}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {file.fileName}
                  </Text>
                  <Text style={styles.fileMeta} numberOfLines={1}>
                    {ov('ownClassCardsGeneratedFileMeta', {
                      count: file.cardCount,
                      pages: file.pages,
                      when,
                    })}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={ov('ownClassCardsDownloadPdf')}
                  disabled={busy}
                  onPress={() => void downloadPdfFile(file)}
                  style={({ pressed }) => [
                    styles.fileDownloadBtn,
                    pressed && !busy && styles.hubBtnPressed,
                    busy && styles.addBtnDisabled,
                  ]}>
                  {busy ? (
                    <ActivityIndicator color={BRAND_BLUE} />
                  ) : (
                    <Ionicons name="download-outline" size={20} color={BRAND_BLUE} />
                  )}
                </Pressable>
              </View>
            );
          })
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}

function DesignEditor({
  ov,
}: {
  ov: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);
  const [previewSide, setPreviewSide] = useState<TeacherClassCardSide>('front');
  const [busySide, setBusySide] = useState<TeacherClassCardSide | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await loadTeacherClassCardTemplate();
      if (!res.ok) {
        appAlert(ov('ownClassCardsTitle'), res.error);
        return;
      }
      setFrontUrl(res.template.frontUrl);
      setBackUrl(res.template.backUrl);
      setPreviewSide(res.template.frontUrl ? 'front' : res.template.backUrl ? 'back' : 'front');
    })();
  }, [ov]);

  const pickImage = async (side: TeacherClassCardSide) => {
    if (side === 'back' && !frontUrl) {
      appAlert(ov('ownClassCardsAddBackTitle'), ov('ownClassCardsAddBackHint'));
      return;
    }
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!lib.granted) {
      appAlert(ov('ownClassCardsTitle'), ov('ownClassCardsPermission'));
      return;
    }
    const launched = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (launched.canceled || !launched.assets[0]?.uri) return;
    setBusySide(side);
    const res = await saveTeacherClassCardSide(side, launched.assets[0].uri);
    setBusySide(null);
    if (!res.ok) {
      appAlert(ov('ownClassCardsTitle'), res.error || ov('ownClassCardsUploadFail'));
      return;
    }
    if (side === 'front') setFrontUrl(res.url);
    else setBackUrl(res.url);
    setPreviewSide(side);
  };

  const removeImage = (side: TeacherClassCardSide) => {
    appAlert(ov('ownClassCardsRemoveTitle'), ov('ownClassCardsRemoveBody'), [
      { text: ov('ownClassCardsCancel'), style: 'cancel' },
      {
        text: ov('ownClassCardsRemove'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusySide(side);
            const res = await removeTeacherClassCardSide(side);
            setBusySide(null);
            if (!res.ok) {
              appAlert(ov('ownClassCardsTitle'), res.error);
              return;
            }
            if (side === 'front') {
              setFrontUrl(null);
              setPreviewSide(backUrl ? 'back' : 'front');
            } else {
              setBackUrl(null);
              setPreviewSide('front');
            }
          })();
        },
      },
    ]);
  };

  const previewUrl = previewSide === 'front' ? frontUrl : backUrl;

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}>
      <Text style={styles.intro}>{ov('ownClassCardsIntro')}</Text>
      <View style={styles.notice}>
        <Ionicons name="information-circle-outline" size={20} color={BRAND_BLUE} />
        <View style={styles.noticeCopy}>
          <Text style={styles.noticeTitle}>{ov('ownClassCardsSizeNoticeTitle')}</Text>
          <Text style={styles.noticeBody}>{ov('ownClassCardsSizeNotice')}</Text>
          <Text style={styles.noticeBody}>{ov('ownClassCardsQrNotice')}</Text>
        </View>
      </View>

      <View style={styles.previewCard}>
        <Text style={styles.previewLabel}>
          {previewSide === 'front' ? ov('ownClassCardsFront') : ov('ownClassCardsBack')}
        </Text>
        <View style={styles.previewFrame}>
          {previewUrl ? (
            <View style={StyleSheet.absoluteFill}>
              <Image source={{ uri: previewUrl }} style={styles.previewImage} contentFit="cover" />
              {previewSide === 'back' ? (
                <TeacherClassCardQrZoneOverlay label={ov('ownClassCardsQrZone')} />
              ) : null}
            </View>
          ) : (
            <TeacherClassCardDefaultPreview
              side={previewSide}
              qrZoneLabel={ov('ownClassCardsQrZone')}
            />
          )}
        </View>
        <View style={styles.sideTabs}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: previewSide === 'front' }}
            onPress={() => setPreviewSide('front')}
            style={[styles.sideTab, previewSide === 'front' && styles.sideTabActive]}>
            <Text style={[styles.sideTabText, previewSide === 'front' && styles.sideTabTextActive]}>
              {ov('ownClassCardsFront')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: previewSide === 'back' }}
            onPress={() => setPreviewSide('back')}
            style={[styles.sideTab, previewSide === 'back' && styles.sideTabActive]}>
            <Text style={[styles.sideTabText, previewSide === 'back' && styles.sideTabTextActive]}>
              {ov('ownClassCardsBack')}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.actions}>
        <ImageAction
          title={frontUrl ? ov('ownClassCardsChangeFront') : ov('ownClassCardsAddFront')}
          busy={busySide === 'front'}
          disabled={busySide !== null}
          onPress={() => void pickImage('front')}
          onRemove={frontUrl ? () => removeImage('front') : undefined}
          removeLabel={ov('ownClassCardsRemove')}
        />
        <ImageAction
          title={backUrl ? ov('ownClassCardsChangeBack') : ov('ownClassCardsAddBack')}
          busy={busySide === 'back'}
          disabled={busySide !== null || !frontUrl}
          onPress={() => void pickImage('back')}
          onRemove={backUrl ? () => removeImage('back') : undefined}
          removeLabel={ov('ownClassCardsRemove')}
        />
        {!frontUrl ? <Text style={styles.hint}>{ov('ownClassCardsAddBackHint')}</Text> : null}
      </View>
    </KeyboardAwareScrollView>
  );
}

function ImageAction({
  title,
  busy,
  disabled,
  onPress,
  onRemove,
  removeLabel,
}: {
  title: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
  onRemove?: () => void;
  removeLabel: string;
}) {
  return (
    <View style={styles.actionRow}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.addBtn,
          pressed && !disabled && styles.addBtnPressed,
          disabled && styles.addBtnDisabled,
        ]}>
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="image-outline" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>{title}</Text>
          </>
        )}
      </Pressable>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={removeLabel}
          disabled={disabled}
          onPress={onRemove}
          style={({ pressed }) => [styles.removeBtn, pressed && styles.removeBtnPressed]}>
          <Ionicons name="trash-outline" size={18} color="#B91C1C" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: 8,
    paddingBottom: PAGE_CONTENT_BOTTOM,
    gap: 16,
  },
  hubBtn: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: BRAND_BLUE,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  hubBtnSecondaryStatic: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: SURFACE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  previewPlaceholder: {
    minHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#BFDBFE',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  previewPlaceholderText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    textAlign: 'center',
  },
  filesSection: { gap: 10 },
  filesEmpty: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E8F1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileCopy: { flex: 1, minWidth: 0, gap: 2 },
  fileName: { fontSize: 13, fontFamily: FontFamily.bold, color: BRAND_BLUE_DARK },
  fileMeta: { fontSize: 12, fontFamily: FontFamily.regular, color: TEXT_MUTED },
  fileDownloadBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E8F1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubBtnPressed: { opacity: 0.88 },
  hubIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubIconSecondary: { backgroundColor: '#E8F1FF' },
  hubBtnText: { flex: 1, color: '#FFFFFF', fontSize: 16, fontFamily: FontFamily.bold },
  hubBtnTextSecondary: { color: BRAND_BLUE_DARK, fontSize: 16, fontFamily: FontFamily.bold },
  generateCopy: { flex: 1, gap: 4, minWidth: 0, paddingTop: 2 },
  generateHint: { fontSize: 13, lineHeight: 18, fontFamily: FontFamily.regular, color: TEXT_MUTED },
  generateLayout: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sheetCol: { flex: 1, minWidth: 0, gap: 8 },
  controlsCol: { width: 108, gap: 8, paddingTop: 22 },
  controlLabel: { fontSize: 12, fontFamily: FontFamily.bold, color: TEXT_MUTED },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    padding: 4,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E8F1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    minWidth: 22,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
  totalValue: { fontSize: 28, lineHeight: 32, fontFamily: FontFamily.black, color: BRAND_BLUE_DARK },
  intro: { fontSize: 14, lineHeight: 20, fontFamily: FontFamily.regular, color: TEXT_MUTED },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#E8F1FF',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#BFDBFE',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  noticeCopy: { flex: 1, gap: 6, minWidth: 0 },
  noticeTitle: { fontSize: 13, fontFamily: FontFamily.bold, color: BRAND_BLUE_DARK },
  noticeBody: { fontSize: 13, lineHeight: 18, fontFamily: FontFamily.regular, color: BRAND_BLUE },
  previewCard: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    padding: 14,
    gap: 12,
  },
  previewLabel: { fontSize: 13, fontFamily: FontFamily.bold, color: BRAND_BLUE_DARK, letterSpacing: 0.2 },
  previewFrame: {
    width: '100%',
    aspectRatio: CARD_ASPECT,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F7FAFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  previewImage: { width: '100%', height: '100%' },
  sideTabs: { flexDirection: 'row', gap: 8 },
  sideTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  sideTabActive: {
    backgroundColor: '#E8F1FF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BRAND_BLUE,
  },
  sideTabText: { fontSize: 13, fontFamily: FontFamily.bold, color: TEXT_MUTED },
  sideTabTextActive: { color: BRAND_BLUE_DARK },
  actions: { gap: 10 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: BRAND_BLUE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  addBtnPressed: { opacity: 0.88 },
  addBtnDisabled: { opacity: 0.45 },
  addBtnText: { color: '#FFFFFF', fontSize: 15, fontFamily: FontFamily.bold },
  removeBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnPressed: { opacity: 0.8 },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    paddingHorizontal: 2,
  },
});
