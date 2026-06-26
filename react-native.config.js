/** Expo 54 Android autolinking workaround for @react-native-firebase/app. */
module.exports = {
  dependencies: {
    '@react-native-firebase/app': {
      platforms: {
        android: {
          packageImportPath: 'import io.invertase.firebase.app.ReactNativeFirebaseAppPackage;',
        },
      },
    },
  },
};
