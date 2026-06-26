import { supabase } from '@/src/services/supabaseClient';
import type { StudentGroupSource } from '@/src/services/studentClassesApi';

export const GROUP_CHAT_AVATAR_BUCKET = 'group-chat-avatars';

export type GroupChatSettings = {
  groupName: string;
  chatDisplayName: string;
  chatAvatarPath: string | null;
};

export async function fetchTeacherGroupChatSettings(
  groupId: string,
  groupSource: StudentGroupSource,
): Promise<{ ok: true; settings: GroupChatSettings } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('teacher_get_group_chat_settings', {
      p_group_id: groupId,
      p_group_source: groupSource,
    });
    if (error) return { ok: false, error: error.message };

    const row = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      settings: {
        groupName: String(row.group_name ?? ''),
        chatDisplayName: String(row.chat_display_name ?? ''),
        chatAvatarPath:
          typeof row.chat_avatar_path === 'string' && row.chat_avatar_path.trim()
            ? row.chat_avatar_path.trim()
            : null,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveTeacherChatDisplayName(
  displayName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await supabase.rpc('teacher_update_chat_display_name', {
      p_display_name: displayName.trim(),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveGroupChatAvatarPath(
  groupId: string,
  groupSource: StudentGroupSource,
  avatarPath: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await supabase.rpc('teacher_update_group_chat_avatar_path', {
      p_group_id: groupId,
      p_group_source: groupSource,
      p_avatar_path: avatarPath,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function groupChatAvatarObjectPath(
  groupId: string,
  groupSource: StudentGroupSource,
  ext: string,
): string {
  return `${groupSource}/${groupId}/avatar.${ext}`;
}

export async function signedGroupChatAvatarUrl(
  path: string | null,
): Promise<string | null> {
  if (!path?.trim()) return null;
  const { data, error } = await supabase.storage
    .from(GROUP_CHAT_AVATAR_BUCKET)
    .createSignedUrl(path.trim(), 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function uploadGroupChatAvatar(
  localUri: string,
  groupId: string,
  groupSource: StudentGroupSource,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  try {
    const response = await fetch(localUri);
    const blob = await response.blob();
    const mime = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const objectPath = groupChatAvatarObjectPath(groupId, groupSource, ext);

    const { error: uploadError } = await supabase.storage
      .from(GROUP_CHAT_AVATAR_BUCKET)
      .upload(objectPath, blob, { upsert: true, contentType: mime });

    if (uploadError) return { ok: false, error: uploadError.message };

    const saved = await saveGroupChatAvatarPath(groupId, groupSource, objectPath);
    if (!saved.ok) return saved;

    return { ok: true, path: objectPath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Upload failed' };
  }
}
