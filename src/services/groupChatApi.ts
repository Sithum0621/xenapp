import type { ProfileRole } from '@/src/navigation/AppNavigator';
import {
  invalidateSessionCache,
  parentGroupChatsCacheKey,
  SessionCacheKeys,
  sessionCacheGetOrFetch,
} from '@/src/services/sessionDataCache';
import { supabase } from '@/src/services/supabaseClient';
import type { StudentGroupSource } from '@/src/services/studentClassesApi';

export type GroupChatListItem = {
  groupId: string;
  groupSource: StudentGroupSource;
  groupName: string;
  instituteName: string;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  lastSenderName: string | null;
};

export type GroupChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  isMine: boolean;
};

export async function fetchCurrentProfileRole(): Promise<ProfileRole | null> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', uid)
    .maybeSingle();
  if (error || !data?.role) return null;
  return data.role as ProfileRole;
}

export function canSendGroupChatMessages(role: ProfileRole | null): boolean {
  return role === 'teacher' || role === 'admin';
}

export async function fetchTeacherGroupChats(): Promise<
  { ok: true; chats: GroupChatListItem[] } | { ok: false; error: string }
> {
  try {
    const { data, error } = await supabase.rpc('teacher_list_group_chats');
    if (error) return { ok: false, error: error.message };

    const chats: GroupChatListItem[] = (data ?? []).map((row: Record<string, unknown>) => ({
      groupId: String(row.group_id),
      groupSource: row.group_source === 'personal' ? 'personal' : 'institute',
      groupName: String(row.group_name ?? ''),
      instituteName: String(row.institute_name ?? ''),
      lastMessageBody:
        typeof row.last_message_body === 'string' ? row.last_message_body : null,
      lastMessageAt:
        typeof row.last_message_at === 'string' ? row.last_message_at : null,
      lastSenderName:
        typeof row.last_sender_name === 'string' ? row.last_sender_name : null,
    }));

    return { ok: true, chats };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function getTeacherGroupChatsCached(options?: { force?: boolean }) {
  return sessionCacheGetOrFetch(
    SessionCacheKeys.TEACHER_GROUP_CHATS,
    () => fetchTeacherGroupChats(),
    {
      force: options?.force,
      shouldCache: (res) => res.ok,
    },
  );
}

export async function fetchParentGroupChats(
  studentUserId: string,
): Promise<{ ok: true; chats: GroupChatListItem[] } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('parent_list_group_chats', {
      p_student_user_id: studentUserId,
    });
    if (error) return { ok: false, error: error.message };

    const chats: GroupChatListItem[] = (data ?? []).map((row: Record<string, unknown>) => ({
      groupId: String(row.group_id),
      groupSource: row.group_source === 'personal' ? 'personal' : 'institute',
      groupName: String(row.group_name ?? ''),
      instituteName: String(row.institute_name ?? ''),
      lastMessageBody:
        typeof row.last_message_body === 'string' ? row.last_message_body : null,
      lastMessageAt:
        typeof row.last_message_at === 'string' ? row.last_message_at : null,
      lastSenderName:
        typeof row.last_sender_name === 'string' ? row.last_sender_name : null,
    }));

    return { ok: true, chats };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function getParentGroupChatsCached(
  studentUserId: string,
  options?: { force?: boolean },
) {
  const studentId = studentUserId.trim();
  return sessionCacheGetOrFetch(
    parentGroupChatsCacheKey(studentId),
    () => fetchParentGroupChats(studentId),
    {
      force: options?.force,
      shouldCache: (res) => res.ok,
    },
  );
}

function mapGroupChatMessageRows(data: unknown): GroupChatMessage[] {
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    body: String(row.body ?? ''),
    createdAt: String(row.created_at ?? ''),
    senderId: String(row.sender_id),
    senderName: String(row.sender_name ?? ''),
    senderRole: String(row.sender_role ?? ''),
    isMine: row.is_mine === true || row.is_mine === 'true',
  }));
}

export async function fetchTeacherGroupChatMessages(
  groupId: string,
  groupSource: StudentGroupSource,
): Promise<{ ok: true; messages: GroupChatMessage[] } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('teacher_list_group_chat_messages', {
      p_group_id: groupId,
      p_group_source: groupSource,
      p_limit: 120,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, messages: mapGroupChatMessageRows(data) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchGroupChatMessages(
  studentUserId: string,
  groupId: string,
  groupSource: StudentGroupSource,
): Promise<{ ok: true; messages: GroupChatMessage[] } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('parent_list_group_chat_messages', {
      p_student_user_id: studentUserId,
      p_group_id: groupId,
      p_group_source: groupSource,
      p_limit: 120,
    });
    if (error) return { ok: false, error: error.message };

    return { ok: true, messages: mapGroupChatMessageRows(data) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendGroupChatMessage(
  groupId: string,
  groupSource: StudentGroupSource,
  body: string,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  try {
    const trimmed = body.trim();
    if (!trimmed) return { ok: false, error: 'message_empty' };

    const { data, error } = await supabase.rpc('chat_send_group_message', {
      p_group_id: groupId,
      p_group_source: groupSource,
      p_body: trimmed,
    });
    if (error) return { ok: false, error: error.message };
    invalidateSessionCache(SessionCacheKeys.TEACHER_GROUP_CHATS);
    return { ok: true, messageId: data ? String(data) : '' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
