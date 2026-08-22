import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import DashboardScreenShell from '@/src/components/layout/DashboardScreenShell';
import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import TeacherClassCardDefaultPreview, {
  TeacherClassCardQrZoneOverlay,
} from '@/src/components/teacher/TeacherClassCardDefaultPreview';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { formatContactNumber } from '@/src/services/studentClassCardApi';
import {
  classCardQrPayloadForStudent,
  fetchClassCardStudentsForGroup,
  lookupClassCardStudentByMobile,
  type ClassCardStudentRow,
} from '@/src/services/teacherClassCardStudentsApi';
import {
  generateTeacherClassCardSheetPdf,
  generateTeacherClassCardSinglePdf,
  shareClassCardPdf,
  type TeacherClassCardSlot,
} from '@/src/services/teacherClassCardSheetPdf';
import { useSessionCachedQuery } from '@/src/hooks/useSessionCachedQuery';
import { SessionCacheKeys } from '@/src/services/sessionDataCache';
import {
  fetchTeacherDashboardOverview,
  type TeacherDashboardClassRow,
} from '@/src/services/teacherDashboardApi';
import {
  loadTeacherClassCardTemplate,
  removeTeacherClassCardSide,
  saveTeacherClassCardSide,
  type TeacherClassCardSide,
} from '@/src/services/teacherClassCardTemplateApi';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { FontFamily } from '@/src/theme/fonts';
import { PAGE_CONTENT_BOTTOM, PAGE_EDGE_INSET } from '@/src/theme/pageLayout';
import { appAlert } from '@/src/utils/appAlert';
import { parseSriLankaMobile, sanitizeSriLankaMobileInput } from '@/src/utils/sriLankaMobile';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const TEXT_MUTED = '#64748B';
const BORDER = '#E2E8F0';
const SURFACE = '#FFFFFF';
const CARD_ASPECT = 1.586;

type ScreenView = 'home' | 'design' | 'generate';

export default function TeacherClassCardsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const ov = (k: string, opts?: Record<string, unknown>) =>
    t(`teacherDashboard.overview.${k}`, opts);
  const [view, setView] = useState<ScreenView>('home');

  const screenTitle =
    view === 'design'
      ? ov('ownClassCardsAddNewDesign')
      : view === 'generate'
        ? ov('ownClassCardsGenerate')
        : ov('ownClassCardsTitle');

  return (
    <DashboardScreenShell
      showBack
      title={screenTitle}
      onBack={() => {
        if (view === 'design' || view === 'generate') {
          setView('home');
          return;
        }
        router.replace(appHref(AppRoutes.teacherDashboard));
      }}
      padContent={false}>
      {view === 'home' ? (
        <HomeView
          ov={ov}
          onAddDesign={() => setView('design')}
          onGenerate={() => setView('generate')}
        />
      ) : view === 'generate' ? (
        <GenerateView ov={ov} />
      ) : (
        <DesignEditor ov={ov} />
      )}
    </DashboardScreenShell>
  );
}

function HomeView({
  ov,
  onAddDesign,
  onGenerate,
}: {
  ov: (k: string, opts?: Record<string, unknown>) => string;
  onAddDesign: () => void;
  onGenerate: () => void;
}) {
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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ov('ownClassCardsGenerate')}
        onPress={onGenerate}
        style={({ pressed }) => [styles.hubBtnOutline, pressed && styles.hubBtnPressed]}>
        <View style={[styles.hubIcon, styles.hubIconSecondary]}>
          <Ionicons name="id-card-outline" size={20} color={BRAND_BLUE} />
        </View>
        <Text style={styles.hubBtnTextSecondary}>{ov('ownClassCardsGenerate')}</Text>
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

type GenerateScope = 'all' | 'one';

function GenerateView({
  ov,
}: {
  ov: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const { data: overviewResult, loading: classesLoading } = useSessionCachedQuery(
    SessionCacheKeys.TEACHER_DASHBOARD_OVERVIEW,
    () => fetchTeacherDashboardOverview(),
    { shouldCache: (res) => !res.error && res.overview != null },
  );

  const classes = overviewResult?.overview?.classes ?? [];
  const [classQuery, setClassQuery] = useState('');
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<TeacherDashboardClassRow | null>(null);
  const [scope, setScope] = useState<GenerateScope>('all');
  const [mobile, setMobile] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [foundStudent, setFoundStudent] = useState<ClassCardStudentRow | null>(null);
  const [generateBusy, setGenerateBusy] = useState(false);

  const classKey = (row: TeacherDashboardClassRow) => `${row.source}:${row.id}`;

  const filteredClasses = useMemo(() => {
    const q = classQuery.trim().toLowerCase();
    if (!q) return classes;
    return classes.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.instituteName ?? '').toLowerCase().includes(q),
    );
  }, [classes, classQuery]);

  const pickClass = (row: TeacherDashboardClassRow) => {
    setSelectedClass(row);
    setClassQuery(row.name);
    setClassPickerOpen(false);
    setMobile('');
    setFoundStudent(null);
  };

  const onClassQueryChange = (value: string) => {
    setClassQuery(value);
    setClassPickerOpen(true);
    if (selectedClass && value.trim() !== selectedClass.name.trim()) {
      setSelectedClass(null);
      setMobile('');
      setFoundStudent(null);
    }
  };

  const searchErrorMessage = (code: string | undefined) => {
    if (code === 'student_not_in_group') return ov('ownClassCardsStudentNotInGroup');
    if (code === 'invalid_username') return ov('ownClassCardsStudentNotFound');
    return ov('ownClassCardsStudentNotFound');
  };

  const buildSlots = useCallback(
    (rows: ClassCardStudentRow[]): TeacherClassCardSlot[] => {
      if (!selectedClass) return [];
      return rows.map((row) => ({
        qrPayload: classCardQrPayloadForStudent(
          selectedClass.source,
          selectedClass.id,
          row.studentUserId,
        ),
        studentName: row.fullName,
        mobileNumber: row.mobileNumber ? formatContactNumber(row.mobileNumber) : undefined,
      }));
    },
    [selectedClass],
  );

  const runPdf = useCallback(
    async (cards: TeacherClassCardSlot[], title: string) => {
      const template = await loadTeacherClassCardTemplate();
      if (!template.ok) {
        appAlert(ov('ownClassCardsTitle'), template.error);
        return false;
      }
      const res =
        cards.length === 1
          ? await generateTeacherClassCardSinglePdf({
              frontUrl: template.template.frontUrl,
              backUrl: template.template.backUrl,
              qrLabel: ov('ownClassCardsQrZone'),
              title,
              card: cards[0],
            })
          : await generateTeacherClassCardSheetPdf({
              frontUrl: template.template.frontUrl,
              backUrl: template.template.backUrl,
              qrLabel: ov('ownClassCardsQrZone'),
              title,
              cards,
            });
      if (!res.ok) {
        appAlert(ov('ownClassCardsTitle'), res.error || ov('ownClassCardsPdfFail'));
        return false;
      }
      if (res.fileUri) {
        const shared = await shareClassCardPdf(res.fileUri, title);
        if (!shared) {
          appAlert(ov('ownClassCardsTitle'), ov('ownClassCardsPdfFail'));
          return false;
        }
      }
      return true;
    },
    [ov],
  );

  const generateAllForClass = async () => {
    if (!selectedClass) return;
    setGenerateBusy(true);
    try {
      const { rows, error } = await fetchClassCardStudentsForGroup(
        selectedClass.source,
        selectedClass.id,
      );
      if (error) {
        appAlert(ov('ownClassCardsTitle'), error);
        return;
      }
      if (rows.length === 0) {
        appAlert(ov('ownClassCardsTitle'), ov('ownClassCardsNoStudentsInClass'));
        return;
      }
      await runPdf(buildSlots(rows), `${selectedClass.name}-class-cards`);
    } finally {
      setGenerateBusy(false);
    }
  };

  const searchStudent = async () => {
    if (!selectedClass) return;
    const phone = parseSriLankaMobile(mobile);
    if (!phone) {
      appAlert(ov('ownClassCardsTitle'), ov('ownClassCardsStudentNotFound'));
      return;
    }
    setSearchBusy(true);
    setFoundStudent(null);
    try {
      const { row, error } = await lookupClassCardStudentByMobile(
        selectedClass.source,
        selectedClass.id,
        phone,
      );
      if (!row) {
        appAlert(ov('ownClassCardsTitle'), searchErrorMessage(error));
        return;
      }
      setFoundStudent(row);
    } finally {
      setSearchBusy(false);
    }
  };

  const generateOneCard = async () => {
    if (!selectedClass || !foundStudent) return;
    setGenerateBusy(true);
    try {
      const safeName = foundStudent.fullName.replace(/[^\w\s-]/g, '').trim() || 'student';
      await runPdf(buildSlots([foundStudent]), `${safeName}-class-card`);
    } finally {
      setGenerateBusy(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled">
      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>{ov('ownClassCardsSelectClass')}</Text>
        <Text style={styles.sectionHint}>{ov('ownClassCardsSearchClassHint')}</Text>

        {classesLoading && classes.length === 0 ? (
          <View style={styles.inlineLoader}>
            <ActivityIndicator color={BRAND_BLUE} />
          </View>
        ) : (
          <View style={styles.comboWrap}>
            <View style={styles.comboInputWrap}>
              <Ionicons name="search-outline" size={18} color={TEXT_MUTED} style={styles.comboIcon} />
              <TextInput
                value={classQuery}
                onChangeText={onClassQueryChange}
                onFocus={() => setClassPickerOpen(true)}
                placeholder={ov('ownClassCardsSearchClassPlaceholder')}
                placeholderTextColor={TEXT_MUTED}
                accessibilityLabel={ov('ownClassCardsSelectClass')}
                style={styles.comboInput}
              />
              {classQuery.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={ov('classesSearchClear')}
                  onPress={() => {
                    setClassQuery('');
                    setSelectedClass(null);
                    setMobile('');
                    setFoundStudent(null);
                    setClassPickerOpen(true);
                  }}
                  hitSlop={8}
                  style={styles.comboClear}>
                  <Ionicons name="close-circle" size={18} color={TEXT_MUTED} />
                </Pressable>
              ) : null}
            </View>

            {classPickerOpen && filteredClasses.length > 0 ? (
              <View style={styles.comboList}>
                {filteredClasses.map((row) => {
                  const selected = selectedClass ? classKey(selectedClass) === classKey(row) : false;
                  return (
                    <Pressable
                      key={classKey(row)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => pickClass(row)}
                      style={({ pressed }) => [
                        styles.comboItem,
                        selected && styles.comboItemSelected,
                        pressed && styles.hubBtnPressed,
                      ]}>
                      <Text style={styles.comboItemTitle} numberOfLines={2}>
                        {row.name}
                      </Text>
                      <Text style={styles.comboItemMeta}>
                        {ov('ownClassCardsStudentCount', { count: row.studentCount })}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : classPickerOpen && classQuery.trim() && filteredClasses.length === 0 ? (
              <Text style={styles.emptyHint}>{ov('classesSearchEmptyTitle')}</Text>
            ) : null}
          </View>
        )}
      </View>

      {selectedClass ? (
        <>
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>{ov('ownClassCardsGenerateScope')}</Text>
            <Text style={styles.sectionHint}>{ov('ownClassCardsGenerateScopeHint')}</Text>
            <View style={styles.scopeRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: scope === 'all' }}
                onPress={() => {
                  setScope('all');
                  setMobile('');
                  setFoundStudent(null);
                }}
                style={[styles.scopeChip, scope === 'all' && styles.scopeChipSelected]}>
                <Text style={[styles.scopeChipText, scope === 'all' && styles.scopeChipTextSelected]}>
                  {ov('ownClassCardsGenerateAllStudents')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: scope === 'one' }}
                onPress={() => setScope('one')}
                style={[styles.scopeChip, scope === 'one' && styles.scopeChipSelected]}>
                <Text style={[styles.scopeChipText, scope === 'one' && styles.scopeChipTextSelected]}>
                  {ov('ownClassCardsGenerateOneStudent')}
                </Text>
              </Pressable>
            </View>
          </View>

          {scope === 'all' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ov('ownClassCardsGenerateAllA11y')}
              disabled={generateBusy}
              onPress={() => void generateAllForClass()}
              style={({ pressed }) => [
                styles.hubBtn,
                pressed && !generateBusy && styles.hubBtnPressed,
                generateBusy && styles.addBtnDisabled,
              ]}>
              {generateBusy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Ionicons name="print-outline" size={20} color="#FFFFFF" />
              )}
              <Text style={styles.hubBtnText}>
                {generateBusy ? ov('ownClassCardsGenerating') : ov('ownClassCardsGenerateAllAction')}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>{ov('ownClassCardsSearchMobile')}</Text>
              <Text style={styles.sectionHint}>{ov('ownClassCardsSearchMobileHint')}</Text>

              <View style={styles.searchRow}>
                <TextInput
                  value={mobile}
                  onChangeText={(v) => setMobile(sanitizeSriLankaMobileInput(v))}
                  placeholder="07XXXXXXXX"
                  placeholderTextColor={TEXT_MUTED}
                  keyboardType="phone-pad"
                  accessibilityLabel={ov('ownClassCardsSearchMobile')}
                  style={styles.searchInput}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={ov('ownClassCardsSearchAction')}
                  disabled={searchBusy || generateBusy}
                  onPress={() => void searchStudent()}
                  style={({ pressed }) => [
                    styles.searchBtn,
                    pressed && !searchBusy && styles.hubBtnPressed,
                    (searchBusy || generateBusy) && styles.addBtnDisabled,
                  ]}>
                  {searchBusy ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Ionicons name="search-outline" size={20} color="#FFFFFF" />
                  )}
                </Pressable>
              </View>

              {foundStudent ? (
                <>
                  <View style={styles.studentRow}>
                    <View style={styles.studentCopy}>
                      <Text style={styles.studentName} numberOfLines={1}>
                        {foundStudent.fullName}
                      </Text>
                      <Text style={styles.studentMeta} numberOfLines={1}>
                        {formatContactNumber(foundStudent.mobileNumber)}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={ov('ownClassCardsGenerateCardAction')}
                    disabled={generateBusy}
                    onPress={() => void generateOneCard()}
                    style={({ pressed }) => [
                      styles.hubBtn,
                      pressed && !generateBusy && styles.hubBtnPressed,
                      generateBusy && styles.addBtnDisabled,
                    ]}>
                    {generateBusy ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Ionicons name="id-card-outline" size={20} color="#FFFFFF" />
                    )}
                    <Text style={styles.hubBtnText}>
                      {generateBusy ? ov('ownClassCardsGenerating') : ov('ownClassCardsGenerateCardAction')}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <Text style={styles.emptyHint}>{ov('ownClassCardsSearchFirst')}</Text>
              )}
            </View>
          )}
        </>
      ) : null}
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
            <View style={StyleSheet.absoluteFill}>
              <TeacherClassCardDefaultPreview
                side={previewSide}
                qrZoneLabel={ov('ownClassCardsQrZone')}
              />
            </View>
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
  hubBtnPressed: { opacity: 0.88 },
  hubIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubBtnText: { flex: 1, color: '#FFFFFF', fontSize: 16, fontFamily: FontFamily.bold },
  hubBtnOutline: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: SURFACE,
    borderWidth: 1.5,
    borderColor: BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  hubIconSecondary: { backgroundColor: '#E8F1FF' },
  hubBtnTextSecondary: { flex: 1, color: BRAND_BLUE_DARK, fontSize: 16, fontFamily: FontFamily.bold },
  sectionBlock: { gap: 10 },
  sectionTitle: { fontSize: 16, fontFamily: FontFamily.bold, color: BRAND_BLUE_DARK },
  sectionHint: { fontSize: 13, lineHeight: 18, fontFamily: FontFamily.regular, color: TEXT_MUTED },
  inlineLoader: { paddingVertical: 20, alignItems: 'center' },
  classChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  classChip: {
    minWidth: '47%',
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  classChipSelected: {
    borderColor: BRAND_BLUE,
    backgroundColor: '#E8F1FF',
  },
  classChipText: { fontSize: 14, fontFamily: FontFamily.bold, color: BRAND_BLUE_DARK },
  classChipTextSelected: { color: BRAND_BLUE },
  classChipMeta: { fontSize: 11, fontFamily: FontFamily.regular, color: TEXT_MUTED },
  comboWrap: { gap: 8 },
  comboInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: SURFACE,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  comboIcon: { marginRight: 8 },
  comboInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    color: BRAND_BLUE_DARK,
    minHeight: 44,
    paddingVertical: 8,
  },
  comboClear: { padding: 4 },
  comboList: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: SURFACE,
    overflow: 'hidden',
    maxHeight: 220,
  },
  comboItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    gap: 2,
  },
  comboItemSelected: { backgroundColor: '#E8F1FF' },
  comboItemTitle: { fontSize: 14, fontFamily: FontFamily.bold, color: BRAND_BLUE_DARK },
  comboItemMeta: { fontSize: 11, fontFamily: FontFamily.regular, color: TEXT_MUTED },
  scopeRow: { flexDirection: 'row', gap: 8 },
  scopeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: SURFACE,
  },
  scopeChipSelected: {
    borderColor: BRAND_BLUE,
    backgroundColor: '#E8F1FF',
  },
  scopeChipText: { fontSize: 14, fontFamily: FontFamily.bold, color: TEXT_MUTED },
  scopeChipTextSelected: { color: BRAND_BLUE_DARK },
  emptyHint: { fontSize: 13, lineHeight: 18, fontFamily: FontFamily.regular, color: TEXT_MUTED },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    paddingHorizontal: 14,
    fontSize: 16,
    color: BRAND_BLUE_DARK,
  },
  searchBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: BRAND_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentRow: {
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
  studentCopy: { flex: 1, minWidth: 0, gap: 2 },
  studentName: { fontSize: 14, fontFamily: FontFamily.bold, color: BRAND_BLUE_DARK },
  studentMeta: { fontSize: 12, fontFamily: FontFamily.regular, color: TEXT_MUTED },
  fileDownloadBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E8F1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
