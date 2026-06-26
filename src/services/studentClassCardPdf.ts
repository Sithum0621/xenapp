import { Asset } from 'expo-asset';
import {
  cacheDirectory,
  copyAsync,
  deleteAsync,
  EncodingType,
  getContentUriAsync,
  readAsStringAsync,
} from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Linking, Platform } from 'react-native';
import QRCode from 'qrcode';

import { buildClassCardQrPayload } from '@/src/utils/xenQrPayload';

import {
  formatContactNumber,
  formatStudentDisplayName,
  type StudentClassCardData,
} from '@/src/services/studentClassCardApi';

const CARD_FRONT = require('@/assets/images/class-card/card-front.png');
const CARD_BACK = require('@/assets/images/class-card/card-back.png');

/** ISO/IEC 7810 ID-1 (credit card) size. */
export const ID_CARD_WIDTH_MM = 85.6;
export const ID_CARD_HEIGHT_MM = 53.98;

export type ClassCardPdfLabels = {
  frontCaption: string;
  backCaption: string;
  nameLabel: string;
  idLabel: string;
  contactLabel: string;
  documentTitle: string;
};

export type ClassCardPdfResult =
  | { ok: true; fileUri: string }
  | { ok: false; error: string; code?: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safePdfBasename(studentId: string): string {
  const trimmed = studentId.trim() || 'student';
  return trimmed.replace(/[^A-Za-z0-9-]/g, '_');
}

async function loadPngBase64(moduleId: number): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) {
    throw new Error('Could not resolve class card image asset.');
  }
  return readAsStringAsync(uri, { encoding: EncodingType.Base64 });
}

/** SVG QR works in React Native (toDataURL needs canvas and fails on device). */
async function buildQrSvgDataUri(payload: string): Promise<string> {
  const svg = await QRCode.toString(payload, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
  });
  const encoded = encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22');
  return `data:image/svg+xml,${encoded}`;
}

type PdfAssets = {
  frontBase64: string;
  backBase64: string;
  qrDataUri: string;
};

export function buildClassCardPdfHtml(
  card: StudentClassCardData,
  assets: PdfAssets,
  labels: ClassCardPdfLabels,
): string {
  const displayName = escapeHtml(formatStudentDisplayName(card.fullName));
  const displayContact = escapeHtml(formatContactNumber(card.mobileNumber));
  const studentId = escapeHtml(card.xenStudentId);
  const title = escapeHtml(labels.documentTitle);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 14mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0e2f63;
      background: #fff;
    }
    .page {
      width: 100%;
      min-height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10mm;
      padding-top: 4mm;
    }
    h1 {
      font-size: 14pt;
      font-weight: 700;
      text-align: center;
      margin-bottom: 2mm;
    }
    .card-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3mm;
      page-break-inside: avoid;
    }
    .card-caption {
      font-size: 10pt;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #123b7a;
    }
    .id-card {
      width: ${ID_CARD_WIDTH_MM}mm;
      height: ${ID_CARD_HEIGHT_MM}mm;
      position: relative;
      overflow: hidden;
      border-radius: 2.5mm;
      box-shadow: 0 0.6mm 2mm rgba(14, 47, 99, 0.18);
    }
    .id-card > img.card-bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .id-card-back .overlay {
      position: absolute;
      left: 5%;
      right: 4%;
      top: 6%;
      bottom: 22%;
      display: flex;
      align-items: center;
    }
    .id-card-back .row {
      display: flex;
      flex-direction: row;
      align-items: center;
      width: 100%;
      height: 100%;
    }
    .id-card-back .qr-col {
      width: 35%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .id-card-back .qr-wrap {
      background: #ffffff;
      padding: 1.4mm;
      border-radius: 0.6mm;
      line-height: 0;
    }
    .id-card-back .qr-wrap img {
      width: 20.5mm;
      height: 20.5mm;
      display: block;
    }
    .id-card-back .details {
      flex: 1;
      margin-left: 1.5mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2.2mm;
    }
    .id-card-back .field-label {
      font-size: 7pt;
      line-height: 1.2;
      color: rgba(255, 255, 255, 0.92);
    }
    .id-card-back .field-value {
      font-size: 8.5pt;
      line-height: 1.25;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.02em;
    }
    .footnote {
      margin-top: 4mm;
      font-size: 8pt;
      color: #64748b;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="page">
    <h1>${title}</h1>

    <div class="card-block">
      <p class="card-caption">${escapeHtml(labels.frontCaption)}</p>
      <div class="id-card id-card-front">
        <img class="card-bg" src="data:image/png;base64,${assets.frontBase64}" alt="" />
      </div>
    </div>

    <div class="card-block">
      <p class="card-caption">${escapeHtml(labels.backCaption)}</p>
      <div class="id-card id-card-back">
        <img class="card-bg" src="data:image/png;base64,${assets.backBase64}" alt="" />
        <div class="overlay">
          <div class="row">
            <div class="qr-col">
              <div class="qr-wrap">
                <img src="${assets.qrDataUri}" alt="QR code" />
              </div>
            </div>
            <div class="details">
              <div class="field">
                <p class="field-label">${escapeHtml(labels.nameLabel)}</p>
                <p class="field-value">${displayName}</p>
              </div>
              <div class="field">
                <p class="field-label">${escapeHtml(labels.idLabel)}</p>
                <p class="field-value">${studentId}</p>
              </div>
              <div class="field">
                <p class="field-label">${escapeHtml(labels.contactLabel)}</p>
                <p class="field-value">${displayContact}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <p class="footnote">${studentId}</p>
  </div>
</body>
</html>`;
}

async function loadPdfAssets(card: StudentClassCardData): Promise<PdfAssets> {
  const [frontBase64, backBase64, qrDataUri] = await Promise.all([
    loadPngBase64(CARD_FRONT),
    loadPngBase64(CARD_BACK),
    buildQrSvgDataUri(buildClassCardQrPayload(card.studentUserId)),
  ]);
  return { frontBase64, backBase64, qrDataUri };
}

function openWebPrint(html: string): void {
  if (typeof window === 'undefined') return;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

/** Copy print output to cache with a stable .pdf name (helps Android MIME + sharing). */
export async function persistClassCardPdf(tempUri: string, studentId: string): Promise<string> {
  if (!cacheDirectory) {
    throw new Error('Device storage is not available.');
  }
  const dest = `${cacheDirectory}${safePdfBasename(studentId)}-class-card.pdf`;
  await deleteAsync(dest, { idempotent: true });
  await copyAsync({ from: tempUri, to: dest });
  return dest;
}

function ensureFileUri(fileUri: string): string {
  if (fileUri.startsWith('file://')) return fileUri;
  return `file://${fileUri}`;
}

export async function shareClassCardPdf(fileUri: string, dialogTitle: string): Promise<boolean> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    return false;
  }
  // expo-sharing requires file:// on Android — not content://
  await Sharing.shareAsync(ensureFileUri(fileUri), {
    mimeType: 'application/pdf',
    dialogTitle,
    UTI: 'com.adobe.pdf',
  });
  return true;
}

export async function openClassCardPdf(fileUri: string): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      const contentUri = await getContentUriAsync(fileUri);
      await Linking.openURL(contentUri);
      return true;
    }
    const localUri = ensureFileUri(fileUri);
    const supported = await Linking.canOpenURL(localUri);
    if (supported) {
      await Linking.openURL(localUri);
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}

export async function generateStudentClassCardPdf(
  card: StudentClassCardData,
  labels: ClassCardPdfLabels,
): Promise<ClassCardPdfResult> {
  try {
    const assets = await loadPdfAssets(card);
    const html = buildClassCardPdfHtml(card, assets, labels);

    if (Platform.OS === 'web') {
      openWebPrint(html);
      return { ok: true, fileUri: '' };
    }

    const { uri: tempUri } = await Print.printToFileAsync({ html });
    if (!tempUri) {
      return { ok: false, error: 'PDF file was not created.', code: 'no_uri' };
    }

    const fileUri = await persistClassCardPdf(tempUri, card.xenStudentId);
    return { ok: true, fileUri };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: 'pdf_failed',
    };
  }
}

/** @deprecated Use generateStudentClassCardPdf + shareClassCardPdf */
export async function exportStudentClassCardPdf(
  card: StudentClassCardData,
  labels: ClassCardPdfLabels,
): Promise<ClassCardPdfResult> {
  const result = await generateStudentClassCardPdf(card, labels);
  if (!result.ok) return result;
  if (!result.fileUri) return result;
  await shareClassCardPdf(result.fileUri, labels.documentTitle);
  return result;
}
