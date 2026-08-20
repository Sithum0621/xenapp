import type { ImageSource } from 'expo-image';

import { BrandAssets } from '@/src/constants/brand';
import { supabase } from '@/src/services/supabaseClient';

export const LANDING_CAROUSEL_BUCKET = 'landing-carousel';
export const LANDING_CAROUSEL_MAX = 5;

export type LandingCarouselSlide = {
  id: string;
  sortOrder: number;
  publicUrl: string;
  altText: string;
  imagePath: string;
  isActive?: boolean;
  createdAt?: string;
};

/** Bundled fallbacks until superadmin uploads live slides. */
export const DEFAULT_LANDING_CAROUSEL: {
  id: string;
  source: ImageSource;
  altText: string;
  contentFit?: 'cover' | 'contain';
}[] = [
  {
    id: 'default-live-class',
    source: BrandAssets.landingLiveClass,
    altText: 'MyTuition live class',
    contentFit: 'cover',
  },
  { id: 'default-1', source: BrandAssets.fullPng, altText: 'MyTuition' },
  { id: 'default-2', source: BrandAssets.markPng, altText: 'MyTuition mark' },
  { id: 'default-3', source: BrandAssets.poweredByWovello, altText: 'Wovello' },
  { id: 'default-4', source: BrandAssets.wovelloMark, altText: 'Wovello mark' },
];

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'svg']);
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/svg+xml',
]);

function parseSlide(raw: unknown): LandingCarouselSlide | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : '';
  const publicUrl = typeof r.public_url === 'string' ? r.public_url.trim() : '';
  const imagePath = typeof r.image_path === 'string' ? r.image_path.trim() : '';
  if (!id || !publicUrl || !imagePath) return null;
  const sortOrder =
    typeof r.sort_order === 'number'
      ? r.sort_order
      : Number.parseInt(String(r.sort_order ?? '0'), 10) || 0;
  return {
    id,
    sortOrder,
    publicUrl,
    imagePath,
    altText: typeof r.alt_text === 'string' ? r.alt_text.trim() : '',
    isActive: typeof r.is_active === 'boolean' ? r.is_active : true,
    createdAt: typeof r.created_at === 'string' ? r.created_at : undefined,
  };
}

export function getLandingCarouselPublicUrl(objectPath: string): string | null {
  const { data } = supabase.storage.from(LANDING_CAROUSEL_BUCKET).getPublicUrl(objectPath.trim());
  return data?.publicUrl?.trim() || null;
}

export function extensionFromNameOrMime(fileName: string, mime: string): string | null {
  const fromName = fileName.split('.').pop()?.toLowerCase()?.trim() ?? '';
  if (ALLOWED_EXT.has(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName;
  const m = mime.toLowerCase();
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/svg+xml') return 'svg';
  return null;
}

export function normalizeCarouselContentType(mime: string, ext: string): string {
  const m = mime.toLowerCase().trim();
  if (ALLOWED_MIME.has(m)) return m === 'image/jpg' ? 'image/jpeg' : m;
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  return 'image/jpeg';
}

/** Public read for the marketing landing page. */
export async function fetchLandingCarousel(): Promise<LandingCarouselSlide[]> {
  const { data, error } = await supabase.rpc('get_landing_carousel');
  if (error) return [];
  if (!Array.isArray(data)) return [];
  return data.map(parseSlide).filter((s): s is LandingCarouselSlide => Boolean(s)).slice(0, LANDING_CAROUSEL_MAX);
}

export async function fetchLandingCarouselForSuperadmin(): Promise<
  { ok: true; slides: LandingCarouselSlide[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('superadmin_list_landing_carousel');
  if (error) return { ok: false, error: error.message };
  if (!Array.isArray(data)) return { ok: true, slides: [] };
  return {
    ok: true,
    slides: data.map(parseSlide).filter((s): s is LandingCarouselSlide => Boolean(s)),
  };
}

export async function uploadLandingCarouselImage(
  localUri: string,
  fileName: string,
  mimeHint?: string,
): Promise<{ ok: true; publicUrl: string; objectPath: string } | { ok: false; error: string }> {
  try {
    const response = await fetch(localUri);
    const blob = await response.blob();
    const mime = normalizeCarouselContentType(mimeHint || blob.type || '', '');
    const ext =
      extensionFromNameOrMime(fileName, mime) ||
      extensionFromNameOrMime(fileName, blob.type || '') ||
      null;
    if (!ext) return { ok: false, error: 'unsupported_type' };

    const contentType = normalizeCarouselContentType(mime || blob.type || '', ext);
    const objectPath = `slides/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from(LANDING_CAROUSEL_BUCKET)
      .upload(objectPath, blob, { upsert: false, contentType });

    if (error) return { ok: false, error: error.message };

    const publicUrl = getLandingCarouselPublicUrl(objectPath);
    if (!publicUrl) return { ok: false, error: 'public_url_failed' };
    return { ok: true, publicUrl, objectPath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'upload_failed' };
  }
}

export async function addLandingCarouselSlide(input: {
  imagePath: string;
  publicUrl: string;
  altText?: string;
}): Promise<{ ok: true; slide: LandingCarouselSlide } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('superadmin_add_landing_carousel_slide', {
    p_image_path: input.imagePath,
    p_public_url: input.publicUrl,
    p_alt_text: input.altText ?? '',
  });
  if (error) return { ok: false, error: error.message };
  const slide = parseSlide(data);
  if (!slide) return { ok: false, error: 'invalid_response' };
  return { ok: true, slide };
}

export async function deleteLandingCarouselSlide(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('superadmin_delete_landing_carousel_slide', {
    p_id: id,
  });
  if (error) return { ok: false, error: error.message };

  const path =
    data && typeof data === 'object' && !Array.isArray(data)
      ? String((data as { image_path?: string }).image_path ?? '')
      : '';
  if (path) {
    await supabase.storage.from(LANDING_CAROUSEL_BUCKET).remove([path]).catch(() => {});
  }
  return { ok: true };
}

export async function reorderLandingCarouselSlide(
  id: string,
  direction: 'up' | 'down',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('superadmin_reorder_landing_carousel_slide', {
    p_id: id,
    p_direction: direction,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
