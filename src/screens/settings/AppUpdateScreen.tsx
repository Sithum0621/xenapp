import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import DashboardScreenShell from '@/src/components/layout/DashboardScreenShell';
import { Text } from '@/src/theme/Text';
import type { Href } from 'expo-router';

import { AppRoutes } from '@/src/navigation/AppNavigator';
import {
  downloadAndroidApk,
  formatByteSize,
  openAndroidApkInstaller,
  openApkDownloadInBrowser,
  type ApkDownloadProgress,
} from '@/src/services/androidApkDownload';
import {
  fetchCurrentAndroidRelease,
  getInstalledAndroidVersionCode,
  getInstalledAppVersionLabel,
  isAndroidUpdateAvailable,
  type AndroidAppRelease,
} from '@/src/services/appReleaseApi';
import { PAGE_EDGE_INSET } from '@/src/theme/pageLayout';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

const BRAND_BLUE_DARK = '#00101F';
const BRAND_BLUE = '#041830';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';
const SURFACE = '#FFFFFF';
const SURFACE_ALT = '#F8FAFC';
const SUCCESS = '#15803D';

type DownloadPhase = 'idle' | 'downloading' | 'ready' | 'error';

type Props = {
  fallbackRoute?: Href;
  /**
   * When true, skip SafeArea + BrandHeader shell (e.g. nested under AdminDashboardShell).
   */
  embedded?: boolean;
};

export default function AppUpdateScreen({
  fallbackRoute = AppRoutes.parentDashboard,
  embedded = false,
}: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [release, setRelease] = useState<AndroidAppRelease | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<DownloadPhase>('idle');
  const [progress, setProgress] = useState<ApkDownloadProgress | null>(null);
  const [localApkUri, setLocalApkUri] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  const installedCode = getInstalledAndroidVersionCode();
  const installedLabel = getInstalledAppVersionLabel();
  const updateAvailable = Platform.OS === 'android' && isAndroidUpdateAvailable(installedCode, release);
  const progressPercent =
    progress && progress.fraction > 0 ? Math.min(100, Math.round(progress.fraction * 100)) : 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPhase('idle');
    setProgress(null);
    setLocalApkUri(null);
    const res = await fetchCurrentAndroidRelease();
    setRelease(res);
    if (!res) {
      setError(t('parentDashboard.appUpdateUnavailable'));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const startDownload = async () => {
    if (!release?.downloadUrl) return;

    setPhase('downloading');
    setError(null);
    setProgress(null);

    const res = await downloadAndroidApk(
      release.downloadUrl,
      release.versionName,
      release.versionCode,
      setProgress,
    );

    if (!res.ok) {
      setPhase('error');
      setError(t('parentDashboard.appUpdateDownloadFailed'));
      return;
    }

    setLocalApkUri(res.fileUri);
    setPhase('ready');
  };

  const startInstall = async () => {
    if (!localApkUri) return;
    setInstalling(true);
    setError(null);
    const ok = await openAndroidApkInstaller(localApkUri);
    setInstalling(false);
    if (!ok) {
      setError(t('parentDashboard.appUpdateInstallFailed'));
    }
  };

  const openBrowserFallback = async () => {
    if (!release?.downloadUrl) return;
    const ok = await openApkDownloadInBrowser(release.downloadUrl);
    if (!ok) {
      setError(t('parentDashboard.appUpdateOpenFailed'));
    }
  };

  const onPrimaryAction = () => {
    if (phase === 'ready') {
      void startInstall();
      return;
    }
    void startDownload();
  };

  const primaryLabel =
    phase === 'ready'
      ? t('parentDashboard.appUpdateInstall')
      : updateAvailable
        ? t('parentDashboard.appUpdateDownload')
        : t('parentDashboard.appUpdateDownloadAnyway');

  const primaryDisabled =
    Platform.OS !== 'android' || !release || phase === 'downloading' || installing;

  const body = (
    <View style={styles.content}>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>{t('parentDashboard.appUpdateInstalled')}</Text>
          <Text style={styles.value}>{installedLabel}</Text>
        </View>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="small" color={BRAND_BLUE} />
            <Text style={styles.muted}>{t('parentDashboard.appUpdateChecking')}</Text>
          </View>
        ) : release ? (
          <>
            <View style={styles.row}>
              <Text style={styles.label}>{t('parentDashboard.appUpdateLatest')}</Text>
              <Text style={styles.value}>
                {release.versionName} ({release.versionCode})
              </Text>
            </View>

            {release.releaseNotes ? (
              <Text style={styles.notes}>{release.releaseNotes}</Text>
            ) : null}

            <View
              style={[
                styles.statusPill,
                updateAvailable ? styles.statusPillUpdate : styles.statusPillCurrent,
              ]}>
              <Ionicons
                name={updateAvailable ? 'cloud-download-outline' : 'checkmark-circle-outline'}
                size={16}
                color={updateAvailable ? BRAND_BLUE_DARK : SUCCESS}
              />
              <Text
                style={[
                  styles.statusText,
                  updateAvailable ? styles.statusTextUpdate : styles.statusTextCurrent,
                ]}>
                {updateAvailable
                  ? t('parentDashboard.appUpdateAvailable')
                  : t('parentDashboard.appUpdateUpToDate')}
              </Text>
            </View>
          </>
        ) : null}

        {phase === 'downloading' ? (
          <View style={styles.progressBlock}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.max(progressPercent, 4)}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {t('parentDashboard.appUpdateDownloading', { percent: progressPercent })}
            </Text>
            {progress && progress.totalBytes > 0 ? (
              <Text style={styles.progressMeta}>
                {formatByteSize(progress.downloadedBytes)} / {formatByteSize(progress.totalBytes)}
              </Text>
            ) : (
              <Text style={styles.progressMeta}>{t('parentDashboard.appUpdateDownloadingWait')}</Text>
            )}
          </View>
        ) : null}

        {phase === 'ready' ? (
          <View style={styles.readyBlock}>
            <Ionicons name="checkmark-circle" size={20} color={SUCCESS} />
            <Text style={styles.readyText}>{t('parentDashboard.appUpdateDownloadComplete')}</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {Platform.OS === 'android' && release ? (
          <>
            <Pressable
              accessibilityRole="button"
              disabled={primaryDisabled}
              onPress={() => void onPrimaryAction()}
              style={({ pressed }) => [
                styles.downloadBtn,
                pressed && !primaryDisabled && styles.downloadBtnPressed,
                primaryDisabled && styles.downloadBtnDisabled,
              ]}>
              {phase === 'downloading' || installing ? (
                <ActivityIndicator size="small" color={SURFACE} />
              ) : (
                <Ionicons
                  name={phase === 'ready' ? 'construct-outline' : 'download-outline'}
                  size={18}
                  color={SURFACE}
                />
              )}
              <Text style={styles.downloadBtnText}>
                {phase === 'downloading'
                  ? t('parentDashboard.appUpdateDownloadingShort')
                  : installing
                    ? t('parentDashboard.appUpdateInstalling')
                    : primaryLabel}
              </Text>
            </Pressable>

            {phase === 'error' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void openBrowserFallback()}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}>
                <Ionicons name="globe-outline" size={16} color={BRAND_BLUE_DARK} />
                <Text style={styles.secondaryBtnText}>
                  {t('parentDashboard.appUpdateOpenBrowser')}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : Platform.OS !== 'android' ? (
          <Text style={styles.muted}>{t('parentDashboard.appUpdateAndroidOnly')}</Text>
        ) : null}
      </View>

      <View style={styles.stepsCard}>
        <Text style={styles.stepsTitle}>{t('parentDashboard.appUpdateStepsTitle')}</Text>
        <View style={styles.stepRow}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepNumber}>1</Text>
          </View>
          <Text style={styles.stepText}>{t('parentDashboard.appUpdateStepDownload')}</Text>
        </View>
        <View style={styles.stepRow}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepNumber}>2</Text>
          </View>
          <Text style={styles.stepText}>{t('parentDashboard.appUpdateStepInstall')}</Text>
        </View>
      </View>

      <Text style={styles.hint}>{t('parentDashboard.appUpdateHint')}</Text>
    </View>
  );

  if (embedded) {
    return body;
  }

  return (
    <DashboardScreenShell
      showBack
      title={t('parentDashboard.appUpdateTitle')}
      subtitle={t('parentDashboard.appUpdateSubtitle')}
      onBack={() => routerBackOrReplace(router, fallbackRoute)}>
      {body}
    </DashboardScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 24 },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    padding: PAGE_EDGE_INSET,
    gap: 12,
  },
  row: { gap: 4 },
  label: { fontSize: 12.5, fontWeight: '700', color: TEXT_MUTED },
  value: { fontSize: 16, fontWeight: '800', color: BRAND_BLUE_DARK },
  loader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muted: { fontSize: 13, color: TEXT_MUTED, lineHeight: 18 },
  notes: { fontSize: 13, color: BRAND_BLUE_DARK, lineHeight: 18 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusPillUpdate: { backgroundColor: 'rgba(18, 59, 122, 0.08)' },
  statusPillCurrent: { backgroundColor: 'rgba(21, 128, 61, 0.08)' },
  statusText: { fontSize: 12.5, fontWeight: '800' },
  statusTextUpdate: { color: BRAND_BLUE_DARK },
  statusTextCurrent: { color: SUCCESS },
  progressBlock: { gap: 6 },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(18, 59, 122, 0.12)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: BRAND_BLUE,
  },
  progressText: { fontSize: 13, fontWeight: '700', color: BRAND_BLUE_DARK },
  progressMeta: { fontSize: 12, color: TEXT_MUTED },
  readyBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(21, 128, 61, 0.08)',
    borderRadius: 10,
    padding: 10,
  },
  readyText: { flex: 1, fontSize: 13, fontWeight: '700', color: SUCCESS, lineHeight: 18 },
  error: { fontSize: 12.5, color: '#B42318', lineHeight: 18 },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BRAND_BLUE,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  downloadBtnPressed: { opacity: 0.92 },
  downloadBtnDisabled: { opacity: 0.6 },
  downloadBtnText: { fontSize: 14, fontWeight: '800', color: SURFACE },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: SURFACE_ALT,
  },
  secondaryBtnPressed: { opacity: 0.88 },
  secondaryBtnText: { fontSize: 13, fontWeight: '800', color: BRAND_BLUE_DARK },
  stepsCard: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    padding: 14,
    gap: 10,
  },
  stepsTitle: { fontSize: 13.5, fontWeight: '800', color: BRAND_BLUE_DARK },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(18, 59, 122, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: { fontSize: 12, fontWeight: '900', color: BRAND_BLUE_DARK },
  stepText: { flex: 1, fontSize: 13, color: TEXT_MUTED, lineHeight: 18 },
  hint: { fontSize: 12, color: TEXT_MUTED, lineHeight: 17 },
});
