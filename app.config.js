const appJson = require('./app.json');

/** @type {import('expo/config').ExpoConfig} */
module.exports = () => ({
  expo: {
    ...appJson.expo,
    web: {
      ...appJson.expo.web,
      // SPA fallback for dev + hosting reloads on nested routes (e.g. /teacher-dashboard/wallet).
      // Set EXPO_WEB_OUTPUT=static when running `expo export --platform web` if you need per-route HTML.
      output: process.env.EXPO_WEB_OUTPUT ?? 'single',
    },
    android: {
      ...appJson.expo.android,
      // EAS file env var path on cloud builds; local path for dev.
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? appJson.expo.android.googleServicesFile,
    },
    ios: {
      ...appJson.expo.ios,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_PLIST ?? appJson.expo.ios.googleServicesFile,
    },
  },
});
