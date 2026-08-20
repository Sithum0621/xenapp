/**
 * Generates MyTuition launcher / splash / favicon from the brand mark.
 * Run: npm run icons
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const imagesDir = path.join(root, 'assets', 'images');
const brandMark = path.join(imagesDir, 'brand', 'mytuition-mark.png');

/** Light blue page / chrome — matches app theme. */
const BRAND_BG = '#EEF4FF';
/** Soft navy square for adaptive icon background. */
const ADAPTIVE_BG = '#041830';

function solidBgSvg(size, color) {
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${color}"/>
</svg>`;
}

async function markOnBackground(size, bgColor, markRatio = 0.72) {
  if (!fs.existsSync(brandMark)) {
    throw new Error(`Missing brand mark: ${brandMark}`);
  }
  const markSize = Math.round(size * markRatio);
  const mark = await sharp(brandMark)
    .resize(markSize, markSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp(Buffer.from(solidBgSvg(size, bgColor)))
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toBuffer();
}

const iconSize = 1024;

const lightIcon = await markOnBackground(iconSize, BRAND_BG, 0.78);
await sharp(lightIcon).toFile(path.join(imagesDir, 'icon.png'));
await sharp(lightIcon).resize(192, 192).toFile(path.join(imagesDir, 'favicon.png'));
await sharp(lightIcon).resize(512, 512).toFile(path.join(imagesDir, 'splash-icon.png'));

// Android adaptive: navy plate + light-tinted mark on transparent-ish foreground pad
const fgMark = await sharp(brandMark)
  .resize(720, 720, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
const fgCanvas = await sharp({
  create: {
    width: iconSize,
    height: iconSize,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: fgMark, gravity: 'center' }])
  .png()
  .toFile(path.join(imagesDir, 'android-icon-foreground.png'));

await sharp(Buffer.from(solidBgSvg(iconSize, ADAPTIVE_BG)))
  .png()
  .toFile(path.join(imagesDir, 'android-icon-background.png'));

// Monochrome: white mark for Android themed icon
const monoRaw = await sharp(brandMark)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const monoOut = Buffer.alloc(monoRaw.data.length);
for (let i = 0; i < monoRaw.data.length; i += 4) {
  const a = monoRaw.data[i + 3];
  monoOut[i] = 255;
  monoOut[i + 1] = 255;
  monoOut[i + 2] = 255;
  monoOut[i + 3] = a;
}
const monoMark = await sharp(monoOut, {
  raw: { width: monoRaw.info.width, height: monoRaw.info.height, channels: 4 },
})
  .resize(720, 720, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
await sharp({
  create: {
    width: iconSize,
    height: iconSize,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: monoMark, gravity: 'center' }])
  .png()
  .toFile(path.join(imagesDir, 'android-icon-monochrome.png'));

void fgCanvas;
console.log('Wrote MyTuition app icons + favicon under assets/images/');
