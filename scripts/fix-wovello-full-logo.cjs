const sharp = require('sharp');
const path = require('path');

(async () => {
  const input = path.join('assets/images/brand/wovello-logo.png');
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  const src = Buffer.from(data);

  // Keep only colorful W mark
  for (let p = 0; p < w * h; p++) {
    const i = p * ch;
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const bri = (r + g + b) / 3;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma >= 18 || bri >= 40) {
      src[i + 3] = 255;
    } else {
      src[i + 3] = 0;
    }
  }

  const markPath = path.join('assets/images/brand/wovello-mark-only.png');
  await sharp(src, { raw: { width: w, height: h, channels: ch } })
    .trim({ threshold: 5 })
    .png()
    .toFile(markPath);

  const markMeta = await sharp(markPath).metadata();
  const markH = 72;
  const markW = Math.round((markMeta.width / markMeta.height) * markH);
  const gap = 14;
  const textW = 210;
  const canvasW = markW + gap + textW;
  const canvasH = Math.max(markH, 72);

  const markBuf = await sharp(markPath)
    .resize(markW, markH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // Full lockup: W mark + "wovello" wordmark (navy, for light footer)
  const svg = Buffer.from(`
    <svg width="${canvasW}" height="${canvasH}" xmlns="http://www.w3.org/2000/svg">
      <text
        x="${markW + gap}"
        y="${Math.round(canvasH * 0.72)}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="42"
        font-weight="700"
        fill="#0E2F63"
        letter-spacing="-0.5"
      >wovello</text>
    </svg>
  `);

  const outPath = path.join('assets/images/brand/wovello-powered-logo.png');
  await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: markBuf, left: 0, top: Math.round((canvasH - markH) / 2) },
      { input: await sharp(svg).png().toBuffer(), left: 0, top: 0 },
    ])
    .png()
    .toFile(outPath);

  const m = await sharp(outPath).metadata();
  console.log('wrote full lockup', outPath, m.width + 'x' + m.height);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
