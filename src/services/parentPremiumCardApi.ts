import { supabase } from '@/src/services/supabaseClient';

export type PremiumCardRequestResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string; code?: string };

export async function requestPremiumClassCard(
  studentUserId: string,
  notes?: string | null,
): Promise<PremiumCardRequestResult> {
  if (!studentUserId.trim()) {
    return { ok: false, error: 'Student is required.', code: 'student_required' };
  }

  try {
    const { data, error } = await supabase.rpc('parent_request_premium_class_card', {
      p_student_user_id: studentUserId,
      p_notes: notes?.trim() || null,
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('pending_request_exists')) {
        return { ok: false, error: error.message, code: 'pending_request_exists' };
      }
      if (msg.includes('not_authorized')) {
        return { ok: false, error: error.message, code: 'not_authorized' };
      }
      if (msg.includes('student_not_found')) {
        return { ok: false, error: error.message, code: 'student_not_found' };
      }
      return { ok: false, error: error.message, code: 'unknown_error' };
    }

    const id =
      data !== null && typeof data === 'object' && !Array.isArray(data)
        ? String((data as Record<string, unknown>).id ?? '')
        : '';

    return { ok: true, requestId: id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: 'unknown_error',
    };
  }
}
