import { Asset } from 'expo-asset';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { Platform } from 'react-native';
import QRCode from 'qrcode';

import {
  persistClassCardPdf,
  shareClassCardPdf,
  type ClassCardPdfResult,
} from '@/src/services/studentClassCardPdf';

const MARK = require('@/assets/images/brand/mytuition-full.png');

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const ID_CARD_WIDTH_MM = 85.6;
export const ID_CARD_HEIGHT_MM = 53.98;
export const CARDS_PER_SHEET = 4;
export const CARD_COL_GAP_MM = 6;
export const CARD_ROW_GAP_MM = 6;
export const SHEET_MARGIN_X_MM =
  (A4_WIDTH_MM - ID_CARD_WIDTH_MM * 2 - CARD_COL_GAP_MM) / 2;
export const SHEET_MARGIN_Y_MM =
  (A4_HEIGHT_MM - ID_CARD_HEIGHT_MM * CARDS_PER_SHEET - CARD_ROW_GAP_MM * (CARDS_PER_SHEET - 1)) /
  2;

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image.'));
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

async function loadPngBase64(moduleId: number): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error('Could not resolve brand image.');
  if (Platform.OS === 'web' || uri.startsWith('http') || uri.startsWith('blob:') || uri.startsWith('data:')) {
    const response = await fetch(uri);
    return blobToBase64(await response.blob());
  }
  return readAsStringAsync(uri, { encoding: EncodingType.Base64 });
}

async function uriToSrc(uri: string | null): Promise<string | null> {
  if (!uri) return null;
  if (uri.startsWith('data:')) return uri;
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const b64 = await blobToBase64(blob);
    const mime = blob.type || 'image/png';
    return `data:${mime};base64,${b64}`;
  } catch {
    return uri;
  }
}

async function qrSvgDataUri(url: string): Promise<string> {
  const svg = await QRCode.toString(url, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
  });
  return `data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type TeacherClassCardSlot = {
  qrPayload: string;
  studentName?: string;
  mobileNumber?: string;
};

function studentBackOverlayHtml(name?: string, mobile?: string): string {
  if (!name?.trim()) return '';
  const nameHtml = escapeHtml(name.trim());
  const mobileHtml = mobile?.trim() ? escapeHtml(mobile.trim()) : '';
  return `<div class="student-overlay">
    <div class="student-name">${nameHtml}</div>
    ${mobileHtml ? `<div class="student-mobile">${mobileHtml}</div>` : ''}
  </div>`;
}

function defaultCardHtml(
  side: 'front' | 'back',
  markSrc: string,
  qrLabel: string,
  qrDataUri?: string,
  slot?: TeacherClassCardSlot,
): string {
  const mark = `<img class="mark" src="${markSrc}" alt="" />`;
  if (side === 'front') {
    const nameTag = slot?.studentName?.trim()
      ? `<div class="front-name">${escapeHtml(slot.studentName.trim())}</div>`
      : '';
    return `<div class="id-card default-card">
      <div class="bar"></div>
      <div class="front-body">${mark}<div class="wordmark"><span class="my">My</span><span class="tuition">Tuition</span></div>${nameTag}</div>
    </div>`;
  }
  const qr = qrDataUri
    ? `<div class="qr-overlay"><img src="${qrDataUri}" alt="" /></div>`
    : `<div class="qr-zone">${escapeHtml(qrLabel)}</div>`;
  const studentCopy = studentBackOverlayHtml(slot?.studentName, slot?.mobileNumber);
  return `<div class="id-card default-card">
    <div class="bar"></div>
    <div class="back-body">${qr}<div class="default-back-copy"><strong>MyTuition</strong>${studentCopy}</div></div>
  </div>`;
}

function faceHtml(
  side: 'front' | 'back',
  src: string | null,
  markSrc: string,
  qrLabel: string,
  qrDataUri?: string,
  slot?: TeacherClassCardSlot,
): string {
  if (!src) return defaultCardHtml(side, markSrc, qrLabel, qrDataUri, slot);
  const qr =
    side === 'back' && qrDataUri
      ? `<div class="qr-overlay"><img src="${qrDataUri}" alt="" /></div>`
      : '';
  const overlay =
    side === 'back' ? studentBackOverlayHtml(slot?.studentName, slot?.mobileNumber) : '';
  return `<div class="id-card"><img class="face" src="${src}" alt="" />${qr}${overlay}</div>`;
}

function buildSheetPdfHtml(input: {
  frontSrc: string | null;
  backSrc: string | null;
  markSrc: string;
  qrLabel: string;
  title: string;
  qrDataUris: (string | undefined)[];
  slots: TeacherClassCardSlot[];
}): string {
  const totalSlots = Math.max(input.slots.length, 1);
  const pages = Math.max(1, Math.ceil(totalSlots / CARDS_PER_SHEET));
  const sheets: string[] = [];
  for (let p = 0; p < pages; p += 1) {
    const rows: string[] = [];
    for (let i = 0; i < CARDS_PER_SHEET; i += 1) {
      const index = p * CARDS_PER_SHEET + i;
      const slot = input.slots[index];
      const qr = input.qrDataUris[index];
      if (!slot) {
        rows.push('<div class="row row-empty"><div class="id-card empty-slot"></div><div class="id-card empty-slot"></div></div>');
        continue;
      }
      rows.push(`<div class="row">
        ${faceHtml('front', input.frontSrc, input.markSrc, input.qrLabel, undefined, slot)}
        ${faceHtml('back', input.backSrc, input.markSrc, input.qrLabel, qr, slot)}
      </div>`);
    }
    sheets.push(`<section class="sheet">${rows.join('')}</section>`);
  }
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; }
    .sheet {
      width: ${A4_WIDTH_MM}mm;
      height: ${A4_HEIGHT_MM}mm;
      padding: ${SHEET_MARGIN_Y_MM}mm ${SHEET_MARGIN_X_MM}mm;
      box-sizing: border-box;
      page-break-after: always;
    }
    .row { display: flex; margin-bottom: ${CARD_ROW_GAP_MM}mm; }
    .row:last-child { margin-bottom: 0; }
    .id-card {
      width: ${ID_CARD_WIDTH_MM}mm;
      height: ${ID_CARD_HEIGHT_MM}mm;
      position: relative;
      overflow: hidden;
      border: 0.2mm solid #94A3B8;
      border-radius: 1.5mm;
      background: #F7FAFF;
    }
    .id-card + .id-card { margin-left: ${CARD_COL_GAP_MM}mm; }
    .face { width: 100%; height: 100%; object-fit: cover; display: block; }
    .default-card { display: flex; flex-direction: column; }
    .bar { height: 4mm; background: #041830; }
    .front-body, .back-body { flex: 1; display: flex; align-items: center; justify-content: center; gap: 2mm; padding: 3mm; }
    .back-body { justify-content: flex-start; }
    .mark { width: 22mm; height: auto; }
    .wordmark { font-weight: 800; font-size: 4.2mm; }
    .my { color: #38BDF8; } .tuition { color: #041830; }
    .qr-zone, .qr-overlay {
      width: 22mm; height: 22mm; background: #fff; border-radius: 1mm;
      display: flex; align-items: center; justify-content: center;
    }
    .qr-zone { border: 0.3mm dashed #94A3B8; font-size: 2.4mm; color: #64748B; }
    .qr-overlay { position: absolute; left: 4%; top: 50%; transform: translateY(-50%); padding: 1.2mm; z-index: 2; }
    .qr-overlay img { width: 100%; height: 100%; display: block; }
    .student-overlay { position: absolute; right: 3mm; bottom: 3mm; left: 28mm; z-index: 3; background: rgba(255,255,255,0.88); padding: 1.2mm 1.6mm; border-radius: 1mm; }
    .student-name { font-size: 3mm; font-weight: 700; color: #041830; line-height: 1.2; }
    .student-mobile { font-size: 2.6mm; color: #64748B; margin-top: 0.5mm; }
    .front-name { font-size: 3.2mm; font-weight: 700; color: #041830; margin-top: 1mm; }
    .empty-slot { background: transparent; border: 0.2mm dashed #CBD5E1; }
    .row-empty .id-card + .id-card { margin-left: ${CARD_COL_GAP_MM}mm; }
  </style>
</head>
<body>${sheets.join('')}</body>
</html>`;
}

function printHtmlInIframe(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Print is not available.'));
      return;
    }
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.style.zIndex = '-1';

    let settled = false;
    const finish = (err?: unknown) => {
      if (settled) return;
      settled = true;
      iframe.remove();
      window.focus();
      if (err) {
        reject(err instanceof Error ? err : new Error('Print failed.'));
        return;
      }
      resolve();
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      const doc = iframe.contentDocument ?? win?.document;
      if (!win || !doc) {
        finish(new Error('Could not open the print view.'));
        return;
      }
      const runPrint = () => {
        win.addEventListener('afterprint', () => finish(), { once: true });
        window.setTimeout(() => finish(), 60_000);
        try {
          win.print();
        } catch (e) {
          finish(e);
        }
      };
      const images = Array.from(doc.images);
      if (images.length === 0) {
        window.setTimeout(runPrint, 200);
        return;
      }
      let pending = images.length;
      const done = () => {
        pending -= 1;
        if (pending <= 0) window.setTimeout(runPrint, 150);
      };
      images.forEach((img) => {
        if (img.complete) done();
        else {
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        }
      });
    };

    document.body.appendChild(iframe);
    iframe.srcdoc = html;
  });
}

async function buildPdfFromHtml(html: string, fileBasename: string): Promise<ClassCardPdfResult> {
  if (Platform.OS === 'web') {
    await printHtmlInIframe(html);
    return { ok: true, fileUri: '' };
  }

  const { uri: tempUri } = await Print.printToFileAsync({
    html,
    width: 595,
    height: 842,
  });
  if (!tempUri) {
    return { ok: false, error: 'PDF file was not created.', code: 'no_uri' };
  }
  const fileUri = await persistClassCardPdf(tempUri, fileBasename);
  return { ok: true, fileUri };
}

async function buildCardPdfHtml(input: {
  frontUrl: string | null;
  backUrl: string | null;
  qrLabel: string;
  title: string;
  cards: TeacherClassCardSlot[];
}): Promise<{ html: string } | { error: string; code: string }> {
  if (input.cards.length === 0) {
    return { error: 'No student cards to generate.', code: 'no_cards' };
  }
  const qrDataUris = await Promise.all(
    input.cards.map((card) => qrSvgDataUri(card.qrPayload)),
  );
  const [frontSrc, backSrc, markBase64] = await Promise.all([
    uriToSrc(input.frontUrl),
    uriToSrc(input.backUrl),
    loadPngBase64(MARK),
  ]);
  const markSrc = `data:image/png;base64,${markBase64}`;
  const html = buildSheetPdfHtml({
    frontSrc,
    backSrc,
    markSrc,
    qrLabel: input.qrLabel,
    title: input.title,
    qrDataUris,
    slots: input.cards,
  });
  return { html };
}

export async function generateTeacherClassCardSheetPdf(input: {
  frontUrl: string | null;
  backUrl: string | null;
  qrLabel: string;
  title: string;
  cards: TeacherClassCardSlot[];
}): Promise<ClassCardPdfResult> {
  try {
    const built = await buildCardPdfHtml(input);
    if ('error' in built) {
      return { ok: false, error: built.error, code: built.code };
    }
    return buildPdfFromHtml(built.html, 'teacher-class-cards');
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: 'pdf_failed',
    };
  }
}

export async function generateTeacherClassCardSinglePdf(input: {
  frontUrl: string | null;
  backUrl: string | null;
  qrLabel: string;
  title: string;
  card: TeacherClassCardSlot;
}): Promise<ClassCardPdfResult> {
  return generateTeacherClassCardSheetPdf({
    frontUrl: input.frontUrl,
    backUrl: input.backUrl,
    qrLabel: input.qrLabel,
    title: input.title,
    cards: [input.card],
  });
}

export { shareClassCardPdf };
