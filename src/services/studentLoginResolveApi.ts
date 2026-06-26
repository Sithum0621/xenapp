import { supabase } from '@/src/services/supabaseClient';
import { parseXenStudentId } from '@/src/utils/loginIdentifier';

/** Map a XEN student ID to the Supabase Auth email used for password sign-in. */
export async function resolveStudentLoginEmail(identifier: string): Promise<string | null> {
  const xenId = parseXenStudentId(identifier);
  if (!xenId) return null;

  const { data, error } = await supabase.rpc('resolve_student_login_email', {
    p_identifier: xenId,
  });

  if (error || typeof data !== 'string' || !data.trim()) {
    return null;
  }
  return data.trim();
}
