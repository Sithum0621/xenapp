/**
 * Generates XEN notification bitmaps:
 * - Large avatar: mint circle + vector half-filled X + graduation-cap badge
 * - Small status icon: white half-filled X (Android monochrome)
 *
 * Run: node scripts/generate-notification-assets.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'assets', 'notifications');
const capPath = path.join(outDir, 'graduation-cap-line.png');

/** XEN palette for the mark on mint. */
const COLORS = {
  mint: '#E4F0D8',
  accent: '#2A9D8F',
  muted: '#1A3D6B',
  mutedSoft: 'rgba(26, 61, 107, 0.38)',
};

/**
 * Vector half-filled X (two diagonals; one arm fully accent, the other split accent/muted).
 * Not a letter glyph — stroked paths like the XEN logomark.
 */
function halfFilledXSvg(size, { accent, muted, mutedOpacity = 1 }) {
  const cx = size / 2;
  const arm = size * 0.19;
  const stroke = Math.max(4, Math.round(size * 0.085));
  const mutedAlpha = mutedOpacity < 1 ? ` stroke-opacity="${mutedOpacity}"` : '';

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(${cx} ${cx})">
    <path d="M ${-arm} ${-arm} L ${arm} ${arm}"
      stroke="${accent}" stroke-width="${stroke}" stroke-linecap="round" fill="none"/>
    <path d="M ${-arm} ${arm} L 0 0"
      stroke="${accent}" stroke-width="${stroke}" stroke-linecap="round" fill="none"/>
    <path d="M 0 0 L ${arm} ${-arm}"
      stroke="${muted}" stroke-width="${stroke}" stroke-linecap="round" fill="none"${mutedAlpha}/>
  </g>
</svg>`;
}

if (!fs.existsSync(capPath)) {
  console.error('Missing graduation-cap-line.png in assets/notifications');
  process.exit(1);
}

const size = 256;
const mint = COLORS.mint;

const circleSvg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${mint}"/>
</svg>`;

const xMarkSvg = halfFilledXSvg(size, {
  accent: COLORS.accent,
  muted: COLORS.muted,
  mutedOpacity: 0.42,
});

fs.writeFileSync(path.join(outDir, 'half-filled-x-mark.svg'), xMarkSvg, 'utf8');

await sharp(Buffer.from(xMarkSvg)).png().toFile(path.join(outDir, 'half-filled-x-mark.png'));

const circle = await sharp(Buffer.from(circleSvg)).png().toBuffer();
const xMark = await sharp(Buffer.from(xMarkSvg)).png().toBuffer();
const cap = await sharp(capPath).resize(72, 72, { fit: 'inside' }).png().toBuffer();

await sharp(circle)
  .composite([
    { input: xMark, gravity: 'center' },
    { input: cap, gravity: 'southeast' },
  ])
  .png()
  .toFile(path.join(outDir, 'wovello-notification-avatar.png'));

/** Status bar: white half-filled X on transparent (monochrome). */
const smallSize = 96;
const smallXSvg = halfFilledXSvg(smallSize, {
  accent: '#FFFFFF',
  muted: '#FFFFFF',
  mutedOpacity: 0.45,
});

await sharp(Buffer.from(smallXSvg))
  .png()
  .toFile(path.join(outDir, 'graduation-cap-small.png'));

console.log(
  'Wrote half-filled-x-mark.svg/png, wovello-notification-avatar.png, graduation-cap-small.png',
);
