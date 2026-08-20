/**
 * Process MyTuition brand PNGs into project assets with clear names.
 * App icons / splash / favicon must stay PNG (store requirements).
 * In-app UI can later swap to SVG when source files are provided.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const os = require('os');

const SRC =
  'C:/Users/COM HOME/.cursor/projects/c-Users-COM-HOME-OneDrive-Desktop-XEN/assets';
const BRAND = path.join(__dirname, '../assets/images/brand');
const IMAGES = path.join(__dirname, '../assets/images');
const NOTIF = path.join(__dirname, '../assets/notifications');
const STAGE = path.join(os.tmpdir(), 'mytuition-brand-stage');

function pick(includes) {
  const files = fs
    .readdirSync(SRC)
    .filter((f) => f.endsWith('.png') && includes.every((p) => f.includes(p)));
  if (!files.length) throw new Error(`Missing: ${includes.join(' + ')}`);
  files.sort((a, b) => {
    const aBg = a.includes('background') ? 1 : 0;
    const bBg = b.includes('background') ? 1 : 0;
    if (aBg !== bBg) return aBg - bBg;
    return b.length - a.length;
  });
  return path.join(SRC, files[0]);
}

function stageCopy(label, includes) {
  const from = pick(includes);
  const to = path.join(STAGE, `${label}.png`);
  fs.copyFileSync(from, to);
  console.log('staged', label, '←', path.basename(from));
  return to;
}

async function trimAndWrite(input, output, opts = {}) {
  let pipeline = sharp(input).ensureAlpha();
  const meta = await sharp(input).metadata();

  if (opts.removeBg === 'black' || opts.removeBg === 'white') {
    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    const thr = opts.removeBg === 'black' ? 28 : 245;
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (opts.removeBg === 'black') {
        if (r <= thr && g <= thr && b <= thr) data[i + 3] = 0;
      } else if (r >= thr && g >= thr && b >= thr) {
        data[i + 3] = 0;
      }
    }
    pipeline = sharp(data, {
      raw: { width: info.width, height: info.height, channels: info.channels },
    });
  }

  await pipeline.trim({ threshold: opts.trimThreshold ?? 10 }).png().toFile(output);
  console.log('wrote', path.relative(process.cwd(), output), `(${meta.width}x${meta.height})`);
}

async function resizeSquare(input, output, size) {
  await sharp(input)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(output);
  console.log('wrote', path.relative(process.cwd(), output), `${size}x${size}`);
}

async function main() {
  fs.mkdirSync(BRAND, { recursive: true });
  fs.mkdirSync(NOTIF, { recursive: true });
  fs.mkdirSync(STAGE, { recursive: true });

  const appIcon = stageCopy('app_icon', ['app_icon-967']);
  const fullLight = stageCopy('full_light', ['ChatGPT_Image']);
  const fullDark = stageCopy('full_dark', ['fulllogo_dark-dea']);
  const markDark = stageCopy('mark_dark', ['iconlogo_dark-d1f']);
  const markLight = stageCopy('mark_light', ['iconlogo_lightbackground-74']);
  const wordDark = stageCopy('word_dark', ['textlogo_dark-688']);
  const wordLight = stageCopy('word_light', ['textlogo_lightbackground-e5e']);
  const notifDark = stageCopy('notif_dark', ['notification_dark-a77']);
  const notifLight = stageCopy('notif_light', ['notification_light-bcc']);

  await trimAndWrite(fullLight, path.join(BRAND, 'mytuition-full-lightbackground.png'), {
    removeBg: 'white',
  });
  await trimAndWrite(fullDark, path.join(BRAND, 'mytuition-full-darkbackground.png'), {
    removeBg: 'black',
  });
  await trimAndWrite(markDark, path.join(BRAND, 'mytuition-mark-darkbackground.png'), {
    removeBg: 'black',
  });
  await trimAndWrite(markLight, path.join(BRAND, 'mytuition-mark-lightbackground.png'), {
    removeBg: 'black',
  });
  await trimAndWrite(wordDark, path.join(BRAND, 'mytuition-wordmark-darkbackground.png'), {
    removeBg: 'black',
  });
  await trimAndWrite(wordLight, path.join(BRAND, 'mytuition-wordmark-lightbackground.png'), {
    removeBg: 'black',
  });

  fs.copyFileSync(
    path.join(BRAND, 'mytuition-mark-lightbackground.png'),
    path.join(BRAND, 'xen-logo.png'),
  );
  // Keep assets/images/brand/wovello-logo.png as the real Wovello mark (Powered by).

  await sharp(appIcon).resize(1024, 1024, { fit: 'cover' }).png().toFile(path.join(IMAGES, 'icon.png'));
  await sharp(appIcon)
    .resize(1024, 1024, { fit: 'cover' })
    .png()
    .toFile(path.join(IMAGES, 'android-icon-foreground.png'));
  await sharp(appIcon).resize(48, 48, { fit: 'cover' }).png().toFile(path.join(IMAGES, 'favicon.png'));
  await sharp(appIcon)
    .resize(512, 512, { fit: 'contain', background: { r: 4, g: 18, b: 48, alpha: 1 } })
    .png()
    .toFile(path.join(IMAGES, 'splash-icon.png'));
  await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: { r: 4, g: 18, b: 48 } },
  })
    .png()
    .toFile(path.join(IMAGES, 'android-icon-background.png'));
  console.log('wrote store icons');

  await trimAndWrite(notifDark, path.join(NOTIF, 'mytuition-notification-darkbackground.png'), {
    removeBg: 'black',
  });
  await trimAndWrite(notifLight, path.join(NOTIF, 'mytuition-notification-lightbackground.png'), {
    removeBg: 'black',
  });
  await resizeSquare(
    path.join(NOTIF, 'mytuition-notification-darkbackground.png'),
    path.join(NOTIF, 'wovello-notification-avatar.png'),
    96,
  );
  await resizeSquare(
    path.join(NOTIF, 'mytuition-notification-lightbackground.png'),
    path.join(NOTIF, 'half-filled-x-mark.png'),
    96,
  );

  console.log('\nDone. Brand assets ready under assets/images/brand/');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
