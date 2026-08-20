import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/src/services/supabaseClient';

export const APP_RELEASES_BUCKET = 'app-releases';

export type AndroidAppRelease = {
  versionName: string;
  versionCode: number;
  downloadUrl: string;
  releaseNotes: string;
};

export type AndroidAppReleaseRecord = AndroidAppRelease & {
  id: string;
  isCurrent: boolean;
  createdAt: string;
};

export type AndroidAppReleaseDraft = {
  versionName: string;
  versionCode: string;
  releaseNotes: string;
};

function parseRelease(raw: unknown): AndroidAppRelease | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const versionName = typeof r.version_name === 'string' ? r.version_name.trim() : '';
  const versionCode =
    typeof r.version_code === 'number'
      ? r.version_code
      : Number.parseInt(String(r.version_code ?? ''), 10);
  const downloadUrl = typeof r.download_url === 'string' ? r.download_url.trim() : '';
  if (!versionName || !Number.isFinite(versionCode) || versionCode <= 0 || !downloadUrl) {
    return null;
  }
  return {
    versionName,
    versionCode,
    downloadUrl,
    releaseNotes: typeof r.release_notes === 'string' ? r.release_notes.trim() : '',
  };
}

/** Bump patch segment: 1.1.0 → 1.1.1 */
export function bumpAndroidVersionName(versionName: string): string {
  const trimmed = versionName.trim();
  const match = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(trimmed);
  if (!match) return trimmed;
  const patch = Number.parseInt(match[3]!, 10);
  if (!Number.isFinite(patch)) return trimmed;
  return `${match[1]}.${match[2]}.${patch + 1}${match[4] ?? ''}`;
}

/** Pre-fill the publish form from the live release (or app.json on first publish). */
export function suggestNextAndroidReleaseDraft(
  current: AndroidAppRelease | null,
): AndroidAppReleaseDraft {
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const appBuild = Constants.expoConfig?.android?.versionCode ?? 1;

  if (!current) {
    return {
      versionName: appVersion,
      versionCode: String(appBuild),
      releaseNotes: '',
    };
  }

  return {
    versionName: bumpAndroidVersionName(current.versionName),
    versionCode: String(current.versionCode + 1),
    releaseNotes: current.releaseNotes,
  };
}

export function buildAppReleaseStoragePath(versionName: string, versionCode: number): string {
  const safeName = versionName.trim().replace(/[^a-zA-Z0-9._-]+/g, '-');
  return `android/xen-${safeName}-build${versionCode}.apk`;
}

export function getAppReleasePublicUrl(objectPath: string): string | null {
  const { data } = supabase.storage.from(APP_RELEASES_BUCKET).getPublicUrl(objectPath.trim());
  return data?.publicUrl?.trim() || null;
}

export async function uploadAndroidAppReleaseApk(
  localUri: string,
  versionName: string,
  versionCode: number,
): Promise<{ ok: true; downloadUrl: string; objectPath: string } | { ok: false; error: string }> {
  if (!Number.isFinite(versionCode) || versionCode <= 0) {
    return { ok: false, error: 'invalid_version_code' };
  }
  if (!versionName.trim()) {
    return { ok: false, error: 'invalid_version_name' };
  }

  try {
    const response = await fetch(localUri);
    const blob = await response.blob();
    const mime =
      blob.type === 'application/vnd.android.package-archive' ||
      blob.type === 'application/octet-stream' ||
      blob.type === 'application/zip'
        ? blob.type
        : 'application/vnd.android.package-archive';
    const objectPath = buildAppReleaseStoragePath(versionName, versionCode);

    const { error } = await supabase.storage
      .from(APP_RELEASES_BUCKET)
      .upload(objectPath, blob, { upsert: true, contentType: mime });

    if (error) return { ok: false, error: error.message };

    const downloadUrl = getAppReleasePublicUrl(objectPath);
    if (!downloadUrl) return { ok: false, error: 'public_url_failed' };

    return { ok: true, downloadUrl, objectPath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'upload_failed' };
  }
}

function parseReleaseRecord(row: Record<string, unknown>): AndroidAppReleaseRecord | null {
  const base = parseRelease({
    version_name: row.version_name,
    version_code: row.version_code,
    download_url: row.download_url,
    release_notes: row.release_notes,
  });
  if (!base || !row.id) return null;
  return {
    ...base,
    id: String(row.id),
    isCurrent: row.is_current === true || row.is_current === 'true',
    createdAt: String(row.created_at ?? ''),
  };
}

export function buildDefaultAppUpdateNotifyBody(versionName: string, versionCode: number): string {
  return `MyTuition ${versionName} (build ${versionCode}) is ready to install. Open Settings → App update to download.`;
}

export async function fetchAndroidReleaseHistory(
  limit = 20,
): Promise<AndroidAppReleaseRecord[]> {
  try {
    const { data, error } = await supabase.rpc('superadmin_list_android_app_releases', {
      p_limit: limit,
    });
    if (error) return [];
    const rows = Array.isArray(data) ? data : [];
    return rows
      .map((row) =>
        parseReleaseRecord(row && typeof row === 'object' ? (row as Record<string, unknown>) : {}),
      )
      .filter((r): r is AndroidAppReleaseRecord => r != null);
  } catch {
    return [];
  }
}

export async function fetchCurrentAndroidRelease(): Promise<AndroidAppRelease | null> {
  try {
    const { data, error } = await supabase.rpc('get_current_android_app_release');
    if (error) return null;
    return parseRelease(data);
  } catch {
    return null;
  }
}

export function getInstalledAndroidVersionCode(): number {
  if (Platform.OS !== 'android') return 0;
  const build = Application.nativeBuildVersion ?? '';
  const parsed = Number.parseInt(build, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getInstalledAppVersionLabel(): string {
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '—';
  const build = Application.nativeBuildVersion;
  if (Platform.OS === 'android' && build) {
    return `${version} (${build})`;
  }
  return version;
}

export function isAndroidUpdateAvailable(
  installedVersionCode: number,
  release: AndroidAppRelease | null,
): boolean {
  if (!release) return false;
  if (installedVersionCode <= 0) return true;
  return release.versionCode > installedVersionCode;
}

export async function publishAndroidAppRelease(input: {
  versionName: string;
  versionCode: number;
  downloadUrl: string;
  releaseNotes?: string;
}): Promise<{ ok: true; release: AndroidAppRelease } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('publish_android_app_release', {
      p_version_name: input.versionName.trim(),
      p_version_code: input.versionCode,
      p_download_url: input.downloadUrl.trim(),
      p_release_notes: input.releaseNotes?.trim() ?? '',
    });
    if (error) return { ok: false, error: error.message };
    const release = parseRelease(data);
    if (!release) return { ok: false, error: 'invalid_response' };
    return { ok: true, release };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function broadcastAppUpdateNotification(opts?: {
  customBody?: string;
  versionName?: string;
  versionCode?: number;
}): Promise<
  | { ok: true; notificationsSent: number; versionName: string; versionCode: number }
  | { ok: false; error: string }
> {
  try {
    const { data, error } = await supabase.rpc('superadmin_broadcast_app_update_notification', {
      p_custom_body: opts?.customBody?.trim() || null,
      p_version_name: opts?.versionName?.trim() || null,
      p_version_code: opts?.versionCode ?? null,
    });
    if (error) return { ok: false, error: error.message };
    const row = data as Record<string, unknown> | null;
    if (!row || row.ok !== true) return { ok: false, error: 'unexpected_response' };
    return {
      ok: true,
      notificationsSent: Number(row.notifications_sent ?? 0),
      versionName: String(row.version_name ?? ''),
      versionCode: Number(row.version_code ?? 0),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
