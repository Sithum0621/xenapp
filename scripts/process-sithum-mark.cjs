/**
 * Convert white-on-black Sithum mark → navy transparent PNG + WebP for light UI.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(
  process.env.USERPROFILE || '',
  '.cursor/projects/c-Users-COM-HOME-OneDrive-Desktop-MyTuition/assets',
  'c__Users_COM_HOME_AppData_Roaming_Cursor_User_workspaceStorage_24bda2b22ec586ffaa2e71e39aea8fc8_images_Sithum-c2987a31-1cd4-49f8-8c16-ec8b84eae986.png',
);
const BRAND = path.join(__dirname, '../assets/images/brand');
const NAVY = { r: 4, g: 24, b: 48 };

async function writeMark(outBase) {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (lum < 28) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
    } else {
      const a = Math.min(255, Math.round(((lum - 28) / (255 - 28)) * 255));
      out[i] = NAVY.r;
      out[i + 1] = NAVY.g;
      out[i + 2] = NAVY.b;
      out[i + 3] = a;
    }
  }

  const base = sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).trim({ threshold: 8 });

  const trimmed = await base.png().toBuffer();
  const metaTrim = await sharp(trimmed).metadata();
  const pad = Math.round(Math.max(metaTrim.width || 1, metaTrim.height || 1) * 0.08);
  const size = Math.max(metaTrim.width || 1, metaTrim.height || 1) + pad * 2;
  const left = Math.floor((size - (metaTrim.width || 0)) / 2);
  const top = Math.floor((size - (metaTrim.height || 0)) / 2);
  const padded = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: trimmed, left, top }])
    .png()
    .toBuffer();

  const pngPath = path.join(BRAND, `${outBase}.png`);
  const webpPath = path.join(BRAND, `${outBase}.webp`);
  await sharp(padded).png().toFile(pngPath);
  await sharp(padded).webp({ quality: 90 }).toFile(webpPath);
  const meta = await sharp(pngPath).metadata();
  console.log('wrote', outBase, `${meta.width}x${meta.height}`);
}

(async () => {
  if (!fs.existsSync(SRC)) throw new Error(`Missing source: ${SRC}`);
  fs.mkdirSync(BRAND, { recursive: true });
  await writeMark('mytuition-mark');
  await writeMark('mytuition-full');
  console.log('done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
