import { supabase } from '@/src/services/supabaseClient';

export type StudentClassCardData = {
  studentUserId: string;
  fullName: string;
  mobileNumber: string;
  xenStudentId: string;
};

export type StudentClassCardResult =
  | { ok: true; card: StudentClassCardData }
  | { ok: false; error: string; code?: string };

function asString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export async function fetchStudentClassCard(
  studentUserId: string,
): Promise<StudentClassCardResult> {
  if (!studentUserId.trim()) {
    return { ok: false, error: 'Student is required.', code: 'student_required' };
  }

  try {
    const { data, error } = await supabase.rpc('student_class_card', {
      p_student_user_id: studentUserId,
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('not_authorized')) {
        return { ok: false, error: error.message, code: 'not_authorized' };
      }
      if (msg.includes('student_not_found')) {
        return { ok: false, error: error.message, code: 'student_not_found' };
      }
      return { ok: false, error: error.message, code: 'unknown_error' };
    }

    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'Invalid response from server.', code: 'invalid_response' };
    }

    const raw = data as Record<string, unknown>;
    const card: StudentClassCardData = {
      studentUserId: asString(raw.student_user_id) || studentUserId,
      fullName: asString(raw.full_name),
      mobileNumber: asString(raw.mobile_number),
      xenStudentId: asString(raw.xen_student_id),
    };

    if (!card.studentUserId) {
      return { ok: false, error: 'Student is required.', code: 'student_required' };
    }

    return { ok: true, card };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: 'unknown_error',
    };
  }
}

/** British-style display for Sri Lankan mobiles when possible. */
export function formatContactNumber(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  if (digits.length === 0) return '—';
  if (digits.startsWith('94') && digits.length >= 11) {
    const local = digits.slice(2);
    return `+94 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`.trim();
  }
  if (digits.length === 9 && digits.startsWith('7')) {
    return `+94 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`.trim();
  }
  if (digits.length === 10 && digits.startsWith('07')) {
    return `+94 ${digits.slice(1, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`.trim();
  }
  return mobile;
}

export function formatStudentDisplayName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '—';
  return trimmed.toUpperCase();
}
