import { supabase } from '@/src/services/supabaseClient';

export type TeacherProfileSavePayload = {
  userId: string;
  firstName: string;
  lastName: string;
  mobileNumber: string;
  address: string;
  nicNumber: string;
  nicFrontPath: string | null;
  nicBackPath: string | null;
};

export type TeacherProfileLoaded = {
  firstName: string;
  lastName: string;
  fullName: string;
  mobileNumber: string;
  address: string;
  nicNumber: string;
  nicFrontPath: string | null;
  nicBackPath: string | null;
};

/**
 * Persist teacher (and same-shape parent) profile fields across the split profile tables:
 *   - Identity (first/last/full name) → `public.profiles` (also exposed read-only via `profiles_core`).
 *   - Contact data (mobile, address, NIC number) → `public.profiles_contact`.
 *   - NIC document storage paths remain on `public.profiles` (the storage RLS keys off
 *     `profiles.nic_document_*_path`; moving them adds zero security and risks breakage).
 *
 * Two-step write. If the contact step fails we surface its error so the user can retry —
 * the bidirectional sync triggers in the database keep both sides converged regardless.
 */
export async function saveTeacherProfileFields(
  payload: TeacherProfileSavePayload,
): Promise<{ error: string | null }> {
  const first = payload.firstName.trim();
  const last = payload.lastName.trim();
  const composedFull = [first, last].filter(Boolean).join(' ');

  const { data: idRow, error: identityErr } = await supabase
    .from('profiles')
    .update({
      first_name: first || null,
      last_name: last || null,
      full_name: composedFull || null,
      nic_document_front_path: payload.nicFrontPath,
      nic_document_back_path: payload.nicBackPath,
    })
    .eq('id', payload.userId)
    .select('id');

  if (identityErr) {
    return { error: identityErr.message };
  }
  if (!idRow?.length) {
    return { error: 'Profile not found for this account. Try signing out and back in.' };
  }

  const { error: contactErr } = await supabase
    .from('profiles_contact')
    .upsert(
      {
        id: payload.userId,
        mobile_number: payload.mobileNumber.trim() || null,
        address: payload.address.trim() || null,
        nic_number: payload.nicNumber.trim() || null,
      },
      { onConflict: 'id' },
    );

  if (contactErr) {
    return { error: contactErr.message };
  }
  return { error: null };
}

/**
 * Load the unified profile view (identity + contact) for the teacher profile editor.
 * Joins `profiles_core` and `profiles_contact` client-side so the UI works with either
 * table getting refreshed first by the realtime / sync triggers.
 */
export async function loadTeacherProfileFields(
  userId: string,
): Promise<{ data: TeacherProfileLoaded | null; error: string | null }> {
  const [coreRes, contactRes, docsRes] = await Promise.all([
    supabase
      .from('profiles_core')
      .select('first_name, last_name, full_name')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('profiles_contact')
      .select('mobile_number, address, nic_number')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('nic_document_front_path, nic_document_back_path')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  if (coreRes.error) return { data: null, error: coreRes.error.message };
  if (contactRes.error) return { data: null, error: contactRes.error.message };
  if (docsRes.error) return { data: null, error: docsRes.error.message };

  return {
    data: {
      firstName: coreRes.data?.first_name ?? '',
      lastName: coreRes.data?.last_name ?? '',
      fullName: coreRes.data?.full_name ?? '',
      mobileNumber: contactRes.data?.mobile_number ?? '',
      address: contactRes.data?.address ?? '',
      nicNumber: contactRes.data?.nic_number ?? '',
      nicFrontPath: docsRes.data?.nic_document_front_path ?? null,
      nicBackPath: docsRes.data?.nic_document_back_path ?? null,
    },
    error: null,
  };
}
