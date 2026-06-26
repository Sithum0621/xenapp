/**
 * Notifee ships `app.notifee:core` in node_modules — Gradle must resolve the local libs folder.
 * The default node.execute() path breaks on Windows paths with spaces.
 */
const { withProjectBuildGradle } = require('@expo/config-plugins');

const NOTIFEE_MARKER = '@notifee/react-native/android/libs';
const MAVEN_LINE =
  '    maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }';

function addNotifeeMavenRepository(contents) {
  if (contents.includes(NOTIFEE_MARKER)) {
    return contents;
  }

  if (contents.includes("maven { url 'https://www.jitpack.io' }")) {
    return contents.replace(
      "maven { url 'https://www.jitpack.io' }",
      `maven { url 'https://www.jitpack.io' }\n${MAVEN_LINE}`,
    );
  }

  return contents.replace(
    /allprojects\s*\{\s*repositories\s*\{/,
    `allprojects {\n  repositories {\n${MAVEN_LINE}`,
  );
}

module.exports = function withNotifeeMavenRepository(config) {
  return withProjectBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language === 'groovy') {
      gradleConfig.modResults.contents = addNotifeeMavenRepository(gradleConfig.modResults.contents);
    }
    return gradleConfig;
  });
};
