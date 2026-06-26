import { supabase } from '@/src/services/supabaseClient';

export const TEACHER_WALLET_SLIP_BUCKET = 'teacher-wallet-slips';

export async function uploadTeacherWalletSlip(
  localUri: string,
  teacherUserId: string,
  requestId: string,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const userId = teacherUserId.trim();
  const id = requestId.trim();
  if (!userId || !id) {
    return { ok: false, error: 'Invalid upload request.' };
  }

  try {
    const response = await fetch(localUri);
    const blob = await response.blob();
    const mime =
      blob.type && (blob.type.startsWith('image/') || blob.type === 'application/pdf')
        ? blob.type
        : 'image/jpeg';
    const ext = mime.includes('png')
      ? 'png'
      : mime.includes('webp')
        ? 'webp'
        : mime.includes('pdf')
          ? 'pdf'
          : 'jpg';
    const objectPath = `${userId}/${id}.${ext}`;

    const { error } = await supabase.storage
      .from(TEACHER_WALLET_SLIP_BUCKET)
      .upload(objectPath, blob, { upsert: true, contentType: mime });

    if (error) return { ok: false, error: error.message };
    return { ok: true, path: objectPath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Upload failed' };
  }
}
