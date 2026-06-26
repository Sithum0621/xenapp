import { supabase } from '@/src/services/supabaseClient';

export type ClassFeePreview = {
  studentUserId: string;
  studentName: string;
  groupId: string;
  groupSource: 'institute' | 'personal';
  groupName: string;
  billingMonth: string;
  classFeeCents: number;
  platformFeeCents: number;
  studentWalletBalanceCents: number;
  alreadyCollected: boolean;
};

export type CollectClassFeeResult = {
  studentName: string;
  groupName: string;
  classFeeCents: number;
  platformFeeCents: number;
  collectionMethod: string;
};

export type CollectionMethod = 'wallet' | 'cash';

function asString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function asBool(value: unknown): boolean {
  return value === true || value === 'true';
}

function parsePreview(data: unknown): ClassFeePreview | null {
  if (!data || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  const groupSource = asString(r.group_source) === 'personal' ? 'personal' : 'institute';
  return {
    studentUserId: asString(r.student_user_id),
    studentName: asString(r.student_name) || 'Student',
    groupId: asString(r.group_id),
    groupSource,
    groupName: asString(r.group_name),
    billingMonth: asString(r.billing_month),
    classFeeCents: asNumber(r.class_fee_cents),
    platformFeeCents: asNumber(r.platform_fee_cents),
    studentWalletBalanceCents: asNumber(r.student_wallet_balance_cents),
    alreadyCollected: asBool(r.already_collected),
  };
}

function parseCollectResult(data: unknown): CollectClassFeeResult | null {
  if (!data || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  return {
    studentName: asString(r.student_name) || 'Student',
    groupName: asString(r.group_name),
    classFeeCents: asNumber(r.class_fee_cents),
    platformFeeCents: asNumber(r.platform_fee_cents),
    collectionMethod: asString(r.collection_method),
  };
}

function mapCollectError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('already_collected')) return 'already_collected';
  if (lower.includes('insufficient_student_balance')) return 'insufficient_student_balance';
  if (lower.includes('student_not_in_group')) return 'student_not_in_group';
  if (lower.includes('student_not_found')) return 'student_not_found';
  if (lower.includes('not_authorized')) return 'not_authorized';
  if (lower.includes('invalid_collection_method')) return 'invalid_collection_method';
  return 'unknown';
}

export async function previewClassFeeCollection(
  studentUserId: string,
  groupId: string,
  groupSource: 'institute' | 'personal',
): Promise<{ preview: ClassFeePreview | null; error: string | null; errorCode: string | null }> {
  try {
    const { data, error } = await supabase.rpc('teacher_preview_class_fee_collection', {
      p_student_user_id: studentUserId,
      p_group_id: groupId,
      p_group_source: groupSource,
    });
    if (error) {
      return { preview: null, error: error.message, errorCode: mapCollectError(error.message) };
    }
    const preview = parsePreview(data);
    if (!preview?.studentUserId) {
      return { preview: null, error: 'Invalid preview response.', errorCode: 'unknown' };
    }
    return { preview, error: null, errorCode: null };
  } catch (e) {
    return {
      preview: null,
      error: e instanceof Error ? e.message : String(e),
      errorCode: 'unknown',
    };
  }
}

export async function collectClassFee(
  studentUserId: string,
  groupId: string,
  groupSource: 'institute' | 'personal',
  method: CollectionMethod,
  includePlatformFee: boolean,
): Promise<{
  result: CollectClassFeeResult | null;
  error: string | null;
  errorCode: string | null;
}> {
  const rpcMethod = method === 'wallet' ? 'wallet' : 'manual';
  try {
    const { data, error } = await supabase.rpc('teacher_collect_class_fee', {
      p_student_user_id: studentUserId,
      p_group_id: groupId,
      p_group_source: groupSource,
      p_collection_method: rpcMethod,
      p_include_platform_fee: includePlatformFee,
    });
    if (error) {
      return { result: null, error: error.message, errorCode: mapCollectError(error.message) };
    }
    const result = parseCollectResult(data);
    if (!result) {
      return { result: null, error: 'Invalid collect response.', errorCode: 'unknown' };
    }
    return { result, error: null, errorCode: null };
  } catch (e) {
    return {
      result: null,
      error: e instanceof Error ? e.message : String(e),
      errorCode: 'unknown',
    };
  }
}
