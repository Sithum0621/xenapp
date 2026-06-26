/**
 * Generates XEN launcher / splash icons from the brand X mark.
 * Run: node scripts/generate-app-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const imagesDir = path.join(root, 'assets', 'images');
const brandLogo = path.join(imagesDir, 'brand', 'xen-logo.png');

const BRAND_BG = '#E6F4FE';
const BRAND_ACCENT = '#2B6FD4';
const BRAND_NAVY = '#0E2F63';

function xenMarkSvg(size) {
  const cx = size / 2;
  const arm = size * 0.22;
  const stroke = Math.max(6, Math.round(size * 0.1));

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${BRAND_BG}"/>
  <g transform="translate(${cx} ${cx})">
    <path d="M ${-arm} ${-arm} L ${arm} ${arm}"
      stroke="${BRAND_ACCENT}" stroke-width="${stroke}" stroke-linecap="round" fill="none"/>
    <path d="M ${-arm} ${arm} L 0 0"
      stroke="${BRAND_ACCENT}" stroke-width="${stroke}" stroke-linecap="round" fill="none"/>
    <path d="M 0 0 L ${arm} ${-arm}"
      stroke="${BRAND_NAVY}" stroke-width="${stroke}" stroke-linecap="round" fill="none" opacity="0.9"/>
  </g>
</svg>`;
}

function solidBgSvg(size, color) {
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${color}"/>
</svg>`;
}

const iconSize = 1024;
const markSvg = xenMarkSvg(iconSize);
const markBuffer = Buffer.from(markSvg);

await sharp(markBuffer).png().toFile(path.join(imagesDir, 'icon.png'));
await sharp(markBuffer).png().toFile(path.join(imagesDir, 'android-icon-foreground.png'));
await sharp(Buffer.from(solidBgSvg(iconSize, BRAND_BG)))
  .png()
  .toFile(path.join(imagesDir, 'android-icon-background.png'));
await sharp(markBuffer).resize(192, 192).png().toFile(path.join(imagesDir, 'favicon.png'));

if (fs.existsSync(brandLogo)) {
  const splashW = 1200;
  const logoW = Math.round(splashW * 0.72);
  const logo = await sharp(brandLogo).resize(logoW, null, { fit: 'inside' }).png().toBuffer();
  await sharp(Buffer.from(solidBgSvg(splashW, '#FFFFFF')))
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(imagesDir, 'splash-icon.png'));
} else {
  await sharp(markBuffer).resize(320, 320).png().toFile(path.join(imagesDir, 'splash-icon.png'));
}

const monoSize = 432;
const monoArm = monoSize * 0.22;
const monoStroke = Math.max(8, Math.round(monoSize * 0.1));
const monoSvg = `<svg width="${monoSize}" height="${monoSize}" viewBox="0 0 ${monoSize} ${monoSize}" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(${monoSize / 2} ${monoSize / 2})">
    <path d="M ${-monoArm} ${-monoArm} L ${monoArm} ${monoArm}" stroke="#123B7A" stroke-width="${monoStroke}" stroke-linecap="round" fill="none"/>
    <path d="M ${-monoArm} ${monoArm} L 0 0" stroke="#123B7A" stroke-width="${monoStroke}" stroke-linecap="round" fill="none"/>
    <path d="M 0 0 L ${monoArm} ${-monoArm}" stroke="#123B7A" stroke-width="${monoStroke}" stroke-linecap="round" fill="none" opacity="0.55"/>
  </g>
</svg>`;
await sharp(Buffer.from(monoSvg)).png().toFile(path.join(imagesDir, 'android-icon-monochrome.png'));

console.log('Wrote XEN app icons under assets/images/');
