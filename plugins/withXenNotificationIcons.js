/**
 * Copies XEN notification bitmaps into Android res/drawable* so Notifee can
 * reference them by resource name in background/killed headless tasks.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const DRAWABLE_FOLDERS = [
  'drawable',
  'drawable-mdpi',
  'drawable-hdpi',
  'drawable-xhdpi',
  'drawable-xxhdpi',
  'drawable-xxxhdpi',
];

const ASSET_MAP = [
  {
    src: 'assets/notifications/wovello-notification-avatar.png',
    dest: 'xen_notification_avatar.png',
  },
  {
    src: 'assets/notifications/half-filled-x-mark.png',
    dest: 'xen_notification_mark.png',
  },
];

function copyAssets(projectRoot, resRoot) {
  for (const folder of DRAWABLE_FOLDERS) {
    const dir = path.join(resRoot, folder);
    fs.mkdirSync(dir, { recursive: true });
    for (const { src, dest } of ASSET_MAP) {
      const from = path.join(projectRoot, src);
      if (!fs.existsSync(from)) {
        throw new Error(`Missing notification asset: ${src}`);
      }
      fs.copyFileSync(from, path.join(dir, dest));
    }
  }
}

function withXenNotificationIcons(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const resRoot = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
      );
      copyAssets(projectRoot, resRoot);
      return cfg;
    },
  ]);
}

module.exports = withXenNotificationIcons;
