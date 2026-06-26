import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import {
  broadcastAppUpdateNotification,
  buildDefaultAppUpdateNotifyBody,
  fetchAndroidReleaseHistory,
  fetchCurrentAndroidRelease,
  publishAndroidAppRelease,
  suggestNextAndroidReleaseDraft,
  uploadAndroidAppReleaseApk,
  type AndroidAppRelease,
  type AndroidAppReleaseRecord,
} from '@/src/services/appReleaseApi';
import { appAlert } from '@/src/utils/appAlert';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const TEXT_MUTED = '#64748B';
const SUBTLE_BORDER = '#E2E8F0';
const PANEL_BG = '#F8FAFC';
const SUCCESS = '#15803D';

type Props = {
  desktopShell?: boolean;
};

function applyDraft(
  release: AndroidAppRelease | null,
  setters: {
    setVersionName: (v: string) => void;
    setVersionCode: (v: string) => void;
    setReleaseNotes: (v: string) => void;
    setDownloadUrl: (v: string) => void;
    setUploadedFileName: (v: string | null) => void;
  },
) {
  const draft = suggestNextAndroidReleaseDraft(release);
  setters.setVersionName(draft.versionName);
  setters.setVersionCode(draft.versionCode);
  setters.setReleaseNotes(draft.releaseNotes);
  setters.setDownloadUrl('');
  setters.setUploadedFileName(null);
}

function formatReleaseDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function SuperAdminAppReleaseSection({ desktopShell }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<AndroidAppRelease | null>(null);
  const [history, setHistory] = useState<AndroidAppReleaseRecord[]>([]);
  const [notifyTarget, setNotifyTarget] = useState<AndroidAppReleaseRecord | null>(null);
  const [versionName, setVersionName] = useState('');
  const [versionCode, setVersionCode] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [notifyBody, setNotifyBody] = useState('');
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notifying, setNotifying] = useState(false);

  const resetDraft = useCallback(
    (release: AndroidAppRelease | null) => {
      applyDraft(release, {
        setVersionName,
        setVersionCode,
        setReleaseNotes,
        setDownloadUrl,
        setUploadedFileName,
      });
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const [release, rows] = await Promise.all([
      fetchCurrentAndroidRelease(),
      fetchAndroidReleaseHistory(),
    ]);
    setCurrent(release);
    setHistory(rows);
    const liveRow = rows.find((r) => r.isCurrent) ?? rows[0] ?? null;
    if (liveRow) {
      setNotifyTarget(liveRow);
      setNotifyBody(buildDefaultAppUpdateNotifyBody(liveRow.versionName, liveRow.versionCode));
    } else if (release) {
      const fallback: AndroidAppReleaseRecord = {
        ...release,
        id: 'current',
        isCurrent: true,
        createdAt: '',
      };
      setNotifyTarget(fallback);
      setNotifyBody(buildDefaultAppUpdateNotifyBody(release.versionName, release.versionCode));
    } else {
      setNotifyTarget(null);
      setNotifyBody('');
    }
    resetDraft(release);
    setLoading(false);
  }, [resetDraft]);

  useEffect(() => {
    void load();
  }, [load]);

  const parsedVersionCode = Number.parseInt(versionCode, 10);

  const onPickAndUploadApk = async () => {
    if (!versionName.trim() || !Number.isFinite(parsedVersionCode) || parsedVersionCode <= 0) {
      appAlert(t('superAdmin.appReleaseErrorTitle'), t('superAdmin.appReleaseValidation'));
      return;
    }

    const picked = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.android.package-archive',
        'application/octet-stream',
        'application/zip',
        '*/*',
      ],
      copyToCacheDirectory: true,
    });

    if (picked.canceled || !picked.assets?.[0]?.uri) return;

    const asset = picked.assets[0];
    setUploading(true);
    const res = await uploadAndroidAppReleaseApk(asset.uri, versionName.trim(), parsedVersionCode);
    setUploading(false);

    if (!res.ok) {
      appAlert(t('superAdmin.appReleaseErrorTitle'), res.error);
      return;
    }

    setDownloadUrl(res.downloadUrl);
    setUploadedFileName(asset.name ?? 'release.apk');
    appAlert(t('superAdmin.appReleaseUploadDoneTitle'), t('superAdmin.appReleaseUploadDoneBody'));
  };

  const onPublish = async () => {
    if (
      !versionName.trim() ||
      !downloadUrl.trim() ||
      !Number.isFinite(parsedVersionCode) ||
      parsedVersionCode <= 0
    ) {
      appAlert(t('superAdmin.appReleaseErrorTitle'), t('superAdmin.appReleaseValidation'));
      return;
    }

    if (current && parsedVersionCode <= current.versionCode) {
      appAlert(
        t('superAdmin.appReleaseErrorTitle'),
        t('superAdmin.appReleaseCodeMustIncrease', { current: current.versionCode }),
      );
      return;
    }

    setPublishing(true);
    const res = await publishAndroidAppRelease({
      versionName,
      versionCode: parsedVersionCode,
      downloadUrl,
      releaseNotes,
    });
    setPublishing(false);

    if (!res.ok) {
      appAlert(t('superAdmin.appReleaseErrorTitle'), res.error);
      return;
    }

    setCurrent(res.release);
    resetDraft(res.release);
    await load();
    appAlert(
      t('superAdmin.appReleasePublishedTitle'),
      t('superAdmin.appReleasePublishedBody', { version: res.release.versionName }),
    );
  };

  const selectNotifyTarget = (row: AndroidAppReleaseRecord) => {
    setNotifyTarget(row);
    setNotifyBody(buildDefaultAppUpdateNotifyBody(row.versionName, row.versionCode));
  };

  const onNotifyAll = async () => {
    const target = notifyTarget ?? (current ? { ...current, id: 'current', isCurrent: true, createdAt: '' } : null);
    if (!target) {
      appAlert(t('superAdmin.appReleaseErrorTitle'), t('superAdmin.appReleaseNoCurrent'));
      return;
    }

    appAlert(
      t('superAdmin.appReleaseNotifyConfirmTitle'),
      t('superAdmin.appReleaseNotifyConfirmBody', {
        version: `${target.versionName} (${target.versionCode})`,
      }),
      [
        { text: t('superAdmin.appReleaseNotifyCancel'), style: 'cancel' },
        {
          text: t('superAdmin.appReleaseNotifyConfirm'),
          onPress: () => {
            void (async () => {
              setNotifying(true);
              const res = await broadcastAppUpdateNotification({
                customBody: notifyBody.trim() || undefined,
                versionName: target.versionName,
                versionCode: target.versionCode,
              });
              setNotifying(false);
              if (!res.ok) {
                appAlert(t('superAdmin.appReleaseErrorTitle'), res.error);
                return;
              }
              appAlert(
                t('superAdmin.appReleaseNotifyDoneTitle'),
                t('superAdmin.appReleaseNotifyDoneBody', {
                  count: res.notificationsSent,
                  version: `${res.versionName} (${res.versionCode})`,
                }),
              );
            })();
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={BRAND_BLUE} />
      </View>
    );
  }

  return (
    <ScrollView
      style={desktopShell ? styles.scrollDesktop : undefined}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Text style={styles.subtitle}>{t('superAdmin.appReleaseSubtitle')}</Text>

      <View style={styles.checklistCard}>
        <Text style={styles.checklistTitle}>{t('superAdmin.appReleaseChecklistTitle')}</Text>
        {(
          [
            'superAdmin.appReleaseChecklist1',
            'superAdmin.appReleaseChecklist2',
            'superAdmin.appReleaseChecklist3',
            'superAdmin.appReleaseChecklist4',
          ] as const
        ).map((key) => (
          <View key={key} style={styles.checklistRow}>
            <Ionicons name="checkmark-circle-outline" size={16} color={BRAND_BLUE} />
            <Text style={styles.checklistText}>{t(key)}</Text>
          </View>
        ))}
      </View>

      {current ? (
        <View style={styles.currentCard}>
          <Text style={styles.currentLabel}>{t('superAdmin.appReleaseCurrent')}</Text>
          <Text style={styles.currentValue}>
            {current.versionName} ({current.versionCode})
          </Text>
          {current.releaseNotes ? (
            <Text style={styles.notes}>{current.releaseNotes}</Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.muted}>{t('superAdmin.appReleaseNone')}</Text>
      )}

      {history.length > 0 ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{t('superAdmin.appReleaseHistoryTitle')}</Text>
          <Text style={styles.hint}>{t('superAdmin.appReleaseHistoryHint')}</Text>
          {history.map((row) => {
            const selected = notifyTarget?.id === row.id;
            return (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                onPress={() => selectNotifyTarget(row)}
                style={({ pressed }) => [
                  styles.historyRow,
                  selected && styles.historyRowSelected,
                  pressed && styles.historyRowPressed,
                ]}>
                <View style={styles.historyMain}>
                  <Text style={styles.historyVersion}>
                    {row.versionName} ({row.versionCode})
                  </Text>
                  {row.isCurrent ? (
                    <View style={styles.liveBadge}>
                      <Text style={styles.liveBadgeText}>{t('superAdmin.appReleaseLiveBadge')}</Text>
                    </View>
                  ) : null}
                </View>
                {row.createdAt ? (
                  <Text style={styles.historyMeta}>{formatReleaseDate(row.createdAt)}</Text>
                ) : null}
                {row.releaseNotes ? (
                  <Text style={styles.historyNotes} numberOfLines={2}>
                    {row.releaseNotes}
                  </Text>
                ) : null}
                {selected ? (
                  <Text style={styles.historySelected}>{t('superAdmin.appReleaseHistorySelected')}</Text>
                ) : (
                  <Text style={styles.historyTap}>{t('superAdmin.appReleaseHistoryTap')}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.panel}>
        <View style={styles.panelTitleRow}>
          <Text style={styles.panelTitle}>{t('superAdmin.appReleasePublishTitle')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => resetDraft(current)}
            hitSlop={8}
            style={({ pressed }) => [styles.linkBtn, pressed && styles.linkBtnPressed]}>
            <Text style={styles.linkBtnText}>{t('superAdmin.appReleaseResetDraft')}</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>{t('superAdmin.appReleaseDraftHint')}</Text>

        <Text style={styles.label}>{t('superAdmin.appReleaseVersionName')}</Text>
        <TextInput
          value={versionName}
          onChangeText={setVersionName}
          placeholder="1.2.0"
          style={styles.input}
        />

        <Text style={styles.label}>{t('superAdmin.appReleaseVersionCode')}</Text>
        <TextInput
          value={versionCode}
          onChangeText={setVersionCode}
          keyboardType="number-pad"
          placeholder="3"
          style={styles.input}
        />

        <Text style={styles.label}>{t('superAdmin.appReleaseApkFile')}</Text>
        <Pressable
          accessibilityRole="button"
          disabled={uploading}
          onPress={() => void onPickAndUploadApk()}
          style={({ pressed }) => [
            styles.uploadBtn,
            pressed && !uploading && styles.uploadBtnPressed,
            uploading && styles.btnDisabled,
          ]}>
          {uploading ? (
            <ActivityIndicator size="small" color={BRAND_BLUE_DARK} />
          ) : (
            <Ionicons name="document-attach-outline" size={18} color={BRAND_BLUE_DARK} />
          )}
          <Text style={styles.uploadBtnText}>
            {uploading ? t('superAdmin.appReleaseUploading') : t('superAdmin.appReleasePickApk')}
          </Text>
        </Pressable>

        {uploadedFileName ? (
          <View style={styles.uploadOk}>
            <Ionicons name="checkmark-circle" size={16} color={SUCCESS} />
            <Text style={styles.uploadOkText} numberOfLines={2}>
              {t('superAdmin.appReleaseUploadedFile', { name: uploadedFileName })}
            </Text>
          </View>
        ) : null}

        {downloadUrl ? (
          <Text style={styles.urlPreview} numberOfLines={2}>
            {downloadUrl}
          </Text>
        ) : (
          <Text style={styles.mutedSmall}>{t('superAdmin.appReleaseUploadFirst')}</Text>
        )}

        <Text style={styles.label}>{t('superAdmin.appReleaseNotes')}</Text>
        <TextInput
          value={releaseNotes}
          onChangeText={setReleaseNotes}
          multiline
          placeholder={t('superAdmin.appReleaseNotesPlaceholder')}
          style={[styles.input, styles.inputMultiline]}
        />

        <Pressable
          accessibilityRole="button"
          disabled={publishing || !downloadUrl.trim()}
          onPress={() => void onPublish()}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && !publishing && downloadUrl.trim() && styles.primaryBtnPressed,
            (publishing || !downloadUrl.trim()) && styles.btnDisabled,
          ]}>
          {publishing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
          )}
          <Text style={styles.primaryBtnText}>{t('superAdmin.appReleasePublish')}</Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{t('superAdmin.appReleaseNotifyTitle')}</Text>
        <Text style={styles.hint}>{t('superAdmin.appReleaseNotifyHint')}</Text>

        {notifyTarget ? (
          <View style={styles.notifyTargetCard}>
            <Text style={styles.notifyTargetLabel}>{t('superAdmin.appReleaseNotifyTarget')}</Text>
            <Text style={styles.notifyTargetValue}>
              {notifyTarget.versionName} ({notifyTarget.versionCode})
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setNotifyBody(
                  buildDefaultAppUpdateNotifyBody(notifyTarget.versionName, notifyTarget.versionCode),
                )
              }
              hitSlop={8}
              style={({ pressed }) => [styles.linkBtn, pressed && styles.linkBtnPressed]}>
              <Text style={styles.linkBtnText}>{t('superAdmin.appReleaseNotifyResetBody')}</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.label}>{t('superAdmin.appReleaseNotifyBodyOptional')}</Text>
        <TextInput
          value={notifyBody}
          onChangeText={setNotifyBody}
          multiline
          placeholder={t('superAdmin.appReleaseNotifyBodyPlaceholder')}
          style={[styles.input, styles.inputMultiline]}
        />

        <Pressable
          accessibilityRole="button"
          disabled={notifying || !notifyTarget}
          onPress={() => void onNotifyAll()}
          style={({ pressed }) => [
            styles.secondaryBtn,
            pressed && !notifying && notifyTarget && styles.secondaryBtnPressed,
            (notifying || !notifyTarget) && styles.btnDisabled,
          ]}>
          {notifying ? (
            <ActivityIndicator size="small" color={BRAND_BLUE_DARK} />
          ) : (
            <Ionicons name="notifications-outline" size={18} color={BRAND_BLUE_DARK} />
          )}
          <Text style={styles.secondaryBtnText}>{t('superAdmin.appReleaseNotifyButton')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollDesktop: { flex: 1 },
  content: { gap: 14, paddingBottom: 32 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  subtitle: { fontSize: 14, color: TEXT_MUTED, lineHeight: 20 },
  checklistCard: {
    backgroundColor: 'rgba(18, 59, 122, 0.06)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SUBTLE_BORDER,
    padding: 14,
    gap: 8,
  },
  checklistTitle: { fontSize: 13, fontWeight: '800', color: BRAND_BLUE_DARK },
  checklistRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  checklistText: { flex: 1, fontSize: 12.5, color: BRAND_BLUE_DARK, lineHeight: 18 },
  muted: { fontSize: 13.5, color: TEXT_MUTED },
  mutedSmall: { fontSize: 12, color: TEXT_MUTED, lineHeight: 17 },
  currentCard: {
    backgroundColor: PANEL_BG,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SUBTLE_BORDER,
    padding: 14,
    gap: 4,
  },
  currentLabel: { fontSize: 12, fontWeight: '700', color: TEXT_MUTED },
  currentValue: { fontSize: 16, fontWeight: '800', color: BRAND_BLUE_DARK },
  notes: { fontSize: 13, color: TEXT_MUTED, lineHeight: 18, marginTop: 4 },
  panel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SUBTLE_BORDER,
    padding: 16,
    gap: 8,
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  panelTitle: { fontSize: 15, fontWeight: '800', color: BRAND_BLUE_DARK, flex: 1 },
  label: { fontSize: 12.5, fontWeight: '700', color: BRAND_BLUE_DARK, marginTop: 4 },
  hint: { fontSize: 12.5, color: TEXT_MUTED, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: BRAND_BLUE_DARK,
    backgroundColor: PANEL_BG,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  linkBtn: { paddingVertical: 4, paddingHorizontal: 2 },
  linkBtnPressed: { opacity: 0.7 },
  linkBtnText: { fontSize: 12.5, fontWeight: '700', color: BRAND_BLUE },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PANEL_BG,
  },
  uploadBtnPressed: { opacity: 0.88 },
  uploadBtnText: { fontSize: 14, fontWeight: '800', color: BRAND_BLUE_DARK },
  uploadOk: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(21, 128, 61, 0.08)',
    borderRadius: 10,
    padding: 10,
  },
  uploadOkText: { flex: 1, fontSize: 12.5, color: SUCCESS, lineHeight: 18, fontWeight: '600' },
  urlPreview: { fontSize: 11.5, color: TEXT_MUTED, lineHeight: 16 },
  primaryBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BRAND_BLUE,
    borderRadius: 12,
    paddingVertical: 12,
  },
  primaryBtnPressed: { opacity: 0.9 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  secondaryBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PANEL_BG,
  },
  secondaryBtnPressed: { opacity: 0.85 },
  secondaryBtnText: { color: BRAND_BLUE_DARK, fontSize: 14, fontWeight: '800' },
  btnDisabled: { opacity: 0.55 },
  historyRow: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SUBTLE_BORDER,
    backgroundColor: PANEL_BG,
    padding: 12,
    gap: 4,
  },
  historyRowSelected: {
    borderColor: BRAND_BLUE,
    backgroundColor: 'rgba(18, 59, 122, 0.06)',
  },
  historyRowPressed: { opacity: 0.88 },
  historyMain: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  historyVersion: { fontSize: 14, fontWeight: '800', color: BRAND_BLUE_DARK },
  liveBadge: {
    backgroundColor: 'rgba(21, 128, 61, 0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  liveBadgeText: { fontSize: 10.5, fontWeight: '800', color: SUCCESS },
  historyMeta: { fontSize: 11.5, color: TEXT_MUTED },
  historyNotes: { fontSize: 12.5, color: TEXT_MUTED, lineHeight: 17 },
  historySelected: { fontSize: 11.5, fontWeight: '700', color: BRAND_BLUE, marginTop: 2 },
  historyTap: { fontSize: 11.5, color: TEXT_MUTED, marginTop: 2 },
  notifyTargetCard: {
    backgroundColor: PANEL_BG,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SUBTLE_BORDER,
    padding: 12,
    gap: 4,
    marginTop: 4,
  },
  notifyTargetLabel: { fontSize: 11.5, fontWeight: '700', color: TEXT_MUTED },
  notifyTargetValue: { fontSize: 15, fontWeight: '800', color: BRAND_BLUE_DARK },
});
