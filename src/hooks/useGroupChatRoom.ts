import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { GroupChatMessage } from '@/src/services/groupChatApi';

const POLL_MS = 4000;

function mergeMessages(prev: GroupChatMessage[], next: GroupChatMessage[]): GroupChatMessage[] {
  if (next.length === 0) return prev.length === 0 ? next : prev;
  const byId = new Map<string, GroupChatMessage>();
  for (const m of prev) byId.set(m.id, m);
  for (const m of next) byId.set(m.id, m);
  return [...byId.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export type UseGroupChatRoomOptions = {
  enabled?: boolean;
  fetchMessages: () => Promise<
    { ok: true; messages: GroupChatMessage[] } | { ok: false; error: string }
  >;
};

export function useGroupChatRoom({ enabled = true, fetchMessages }: UseGroupChatRoomOptions) {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!enabled) {
        setLoading(false);
        return;
      }
      if (!opts?.silent) setLoading(true);

      const res = await fetchMessages();
      if (res.ok) {
        setMessages((prev) => mergeMessages(prev, res.messages));
        setError(null);
      } else {
        if (!opts?.silent) {
          setMessages([]);
          setError(res.error);
        }
      }
      if (!opts?.silent) setLoading(false);
    },
    [enabled, fetchMessages],
  );

  const reloadQuiet = useCallback(() => load({ silent: true }), [load]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void reloadQuiet();

      pollRef.current = setInterval(() => {
        void reloadQuiet();
      }, POLL_MS);

      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }, [reloadQuiet]),
  );

  return {
    loading,
    messages,
    setMessages,
    error,
    load,
    reloadQuiet,
  };
}
