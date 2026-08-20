import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/src/services/supabaseClient';
import {
  buildIssuedClassCardQrUrl,
  ISSUED_CARD_TOKEN_PREFIX,
  isIssuedClassCardToken,
} from '@/src/utils/xenQrPayload';

const STORAGE_KEY = 'teacher_class_card_tokens:v1';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const TOKEN_BODY_LEN = 20;

export type IssuedClassCard = {
  token: string;
  qrUrl: string;
  teacherUserId: string;
  createdAt: string;
};

type TokenStore = {
  used: string[];
  records: IssuedClassCard[];
};

function randomToken(): string {
  const bytes = new Uint8Array(TOKEN_BODY_LEN);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let body = '';
  for (let i = 0; i < bytes.length; i += 1) {
    body += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${ISSUED_CARD_TOKEN_PREFIX}${body}`;
}

async function readStore(): Promise<TokenStore> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { used: [], records: [] };
    const parsed = JSON.parse(raw) as Partial<TokenStore>;
    const used = Array.isArray(parsed.used)
      ? parsed.used.filter((t) => typeof t === 'string' && isIssuedClassCardToken(t))
      : [];
    const records = Array.isArray(parsed.records)
      ? parsed.records.filter(
          (r): r is IssuedClassCard =>
            Boolean(r) &&
            typeof r.token === 'string' &&
            isIssuedClassCardToken(r.token) &&
            typeof r.qrUrl === 'string' &&
            typeof r.teacherUserId === 'string',
        )
      : [];
    return { used: Array.from(new Set([...used, ...records.map((r) => r.token)])), records };
  } catch {
    return { used: [], records: [] };
  }
}

async function writeStore(store: TokenStore): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export async function lookupIssuedClassCard(
  token: string,
): Promise<{ ok: true; studentUserId: string | null; claimed: boolean } | { ok: false; error: string }> {
  const trimmed = token.trim();
  if (!isIssuedClassCardToken(trimmed)) {
    return { ok: false, error: 'invalid_token' };
  }
  const { data, error } = await supabase.rpc('lookup_issued_class_card', { p_token: trimmed });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    return { ok: true, studentUserId: null, claimed: false };
  }
  const r = row as Record<string, unknown>;
  const studentUserId = typeof r.student_user_id === 'string' ? r.student_user_id : null;
  return { ok: true, studentUserId, claimed: r.claimed === true || Boolean(studentUserId) };
}

export async function mintTeacherClassCardTokens(
  count: number,
): Promise<{ ok: true; cards: IssuedClassCard[] } | { ok: false; error: string }> {
  const n = Math.max(1, Math.min(80, Math.round(count)));
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) {
    return { ok: false, error: error?.message ?? 'Not signed in.' };
  }
  const teacherUserId = data.user.id;
  const store = await readStore();
  const used = new Set(store.used);
  const cards: IssuedClassCard[] = [];
  let guard = 0;
  while (cards.length < n && guard < n * 20) {
    guard += 1;
    const token = randomToken();
    if (used.has(token)) continue;
    used.add(token);
    cards.push({
      token,
      qrUrl: buildIssuedClassCardQrUrl(token),
      teacherUserId,
      createdAt: new Date().toISOString(),
    });
  }
  if (cards.length < n) {
    return { ok: false, error: 'Could not mint unique QR tokens.' };
  }
  store.used = Array.from(used);
  store.records = [...cards, ...store.records].slice(0, 2000);
  await writeStore(store);

  const { error: insertError } = await supabase.from('issued_class_cards').insert(
    cards.map((card) => ({
      token: card.token,
      teacher_user_id: teacherUserId,
    })),
  );
  if (insertError) {
    console.warn('issued_class_cards insert:', insertError.message);
  }

  return { ok: true, cards };
}
