const fs = require('fs');
const path = require('path');
const appJson = require('./app.json');

/** Read public Firebase client keys from repo google-services.json (no manual .env needed). */
function loadGoogleServicesWeb() {
  try {
    const filePath =
      process.env.GOOGLE_SERVICES_JSON ??
      appJson.expo.android?.googleServicesFile ??
      './google-services.json';
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.join(__dirname, filePath);
    const gs = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    const client = gs.client?.[0];
    const projectId = gs.project_info?.project_id ?? '';
    return {
      apiKey: client?.api_key?.[0]?.current_key ?? '',
      projectId,
      messagingSenderId: gs.project_info?.project_number ?? '',
      authDomain: projectId ? `${projectId}.firebaseapp.com` : '',
      storageBucket: gs.project_info?.storage_bucket ?? '',
    };
  } catch {
    return {
      apiKey: 'AIzaSyAB0f4aRXEYx0zbt6DtsB-GOHdTCTKLhKU',
      projectId: 'xenv0001',
      messagingSenderId: '840326303130',
      authDomain: 'xenv0001.firebaseapp.com',
      storageBucket: 'xenv0001.firebasestorage.app',
    };
  }
}

const fbFromGoogleServices = loadGoogleServicesWeb();

/** @type {import('expo/config').ExpoConfig} */
module.exports = () => ({
  expo: {
    ...appJson.expo,
    web: {
      ...appJson.expo.web,
      output: process.env.EXPO_WEB_OUTPUT ?? 'single',
    },
    android: {
      ...appJson.expo.android,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? appJson.expo.android.googleServicesFile,
    },
    ios: {
      ...appJson.expo.ios,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_PLIST ?? appJson.expo.ios.googleServicesFile,
    },
    extra: {
      ...appJson.expo.extra,
      firebaseWeb: {
        apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? fbFromGoogleServices.apiKey,
        projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? fbFromGoogleServices.projectId,
        messagingSenderId:
          process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??
          fbFromGoogleServices.messagingSenderId,
        authDomain:
          process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? fbFromGoogleServices.authDomain,
        storageBucket:
          process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? fbFromGoogleServices.storageBucket,
        appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
        vapidKey: process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY ?? '',
      },
    },
  },
});
