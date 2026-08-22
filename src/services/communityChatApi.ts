import type { GroupChatMessage } from '@/src/services/groupChatApi';
import { SessionCacheKeys, sessionCacheGetOrFetch } from '@/src/services/sessionDataCache';
import { supabase } from '@/src/services/supabaseClient';

import { APP_COMMUNITY_TITLE, normalizeCommunityTitle } from '@/src/constants/brand';

/** @deprecated Prefer APP_COMMUNITY_TITLE — kept for existing imports. */
export const XEN_COMMUNITY_TITLE = APP_COMMUNITY_TITLE;

export type CommunityChatPreview = {
  title: string;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  lastSenderName: string | null;
};

function mapMessageRows(data: unknown): GroupChatMessage[] {
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

export async function fetchCommunityChatSummary(): Promise<CommunityChatPreview> {
  const fallback: CommunityChatPreview = {
    title: XEN_COMMUNITY_TITLE,
    lastMessageBody: null,
    lastMessageAt: null,
    lastSenderName: null,
  };

  try {
    const { data, error } = await supabase.rpc('community_chat_summary');
    if (error) return fallback;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== 'object') return fallback;

    const r = row as Record<string, unknown>;
    return {
      title: normalizeCommunityTitle(typeof r.title === 'string' ? r.title : null),
      lastMessageBody: typeof r.last_message_body === 'string' ? r.last_message_body : null,
      lastMessageAt: typeof r.last_message_at === 'string' ? r.last_message_at : null,
      lastSenderName: typeof r.last_sender_name === 'string' ? r.last_sender_name : null,
    };
  } catch {
    return fallback;
  }
}

export function getCommunityChatSummaryCached(options?: { force?: boolean }) {
  return sessionCacheGetOrFetch(
    SessionCacheKeys.PARENT_COMMUNITY_CHAT,
    () => fetchCommunityChatSummary(),
    { force: options?.force },
  );
}

export async function fetchCommunityChatMessages(): Promise<
  { ok: true; messages: GroupChatMessage[] } | { ok: false; error: string }
> {
  try {
    const { data, error } = await supabase.rpc('community_chat_list_messages', { p_limit: 120 });
    if (error) return { ok: false, error: error.message };
    return { ok: true, messages: mapMessageRows(data) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendCommunityChatMessage(
  body: string,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  try {
    const trimmed = body.trim();
    if (!trimmed) return { ok: false, error: 'message_empty' };

    const { data, error } = await supabase.rpc('community_chat_send_message', { p_body: trimmed });
    if (error) return { ok: false, error: error.message };
    return { ok: true, messageId: data ? String(data) : '' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
