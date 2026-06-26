import {
  cacheDirectory,
  createDownloadResumable,
  deleteAsync,
  getContentUriAsync,
} from 'expo-file-system/legacy';
import { Linking, Platform } from 'react-native';

export type ApkDownloadProgress = {
  totalBytes: number;
  downloadedBytes: number;
  fraction: number;
};

export function buildApkLocalPath(versionName: string, versionCode: number): string {
  const safeName = versionName.trim().replace(/[^a-zA-Z0-9._-]+/g, '-');
  return `${cacheDirectory ?? ''}xen-${safeName}-build${versionCode}.apk`;
}

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function downloadAndroidApk(
  downloadUrl: string,
  versionName: string,
  versionCode: number,
  onProgress?: (progress: ApkDownloadProgress) => void,
): Promise<{ ok: true; fileUri: string } | { ok: false; error: string }> {
  if (!cacheDirectory) {
    return { ok: false, error: 'storage_unavailable' };
  }

  const dest = buildApkLocalPath(versionName, versionCode);

  try {
    await deleteAsync(dest, { idempotent: true });
  } catch {
    // ignore stale file cleanup errors
  }

  try {
    const resumable = createDownloadResumable(
      downloadUrl,
      dest,
      {},
      (progress) => {
        const totalBytes = progress.totalBytesExpectedToWrite ?? 0;
        const downloadedBytes = progress.totalBytesWritten ?? 0;
        onProgress?.({
          totalBytes,
          downloadedBytes,
          fraction: totalBytes > 0 ? downloadedBytes / totalBytes : 0,
        });
      },
    );

    const result = await resumable.downloadAsync();
    if (!result?.uri) {
      return { ok: false, error: 'download_failed' };
    }

    return { ok: true, fileUri: result.uri };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'download_failed' };
  }
}

export async function openAndroidApkInstaller(fileUri: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    const contentUri = await getContentUriAsync(fileUri);
    await Linking.openURL(contentUri);
    return true;
  } catch {
    return false;
  }
}

export async function openApkDownloadInBrowser(downloadUrl: string): Promise<boolean> {
  try {
    const supported = await Linking.canOpenURL(downloadUrl);
    if (!supported) return false;
    await Linking.openURL(downloadUrl);
    return true;
  } catch {
    return false;
  }
}
