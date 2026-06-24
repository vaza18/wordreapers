const { withInfoPlist } = require('expo/config-plugins');

/**
 * Ensure the native app follows the OS light/dark setting (required for Auto theme).
 */
function withAutomaticUiStyle(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.UIUserInterfaceStyle = 'Automatic';
    return config;
  });
}

module.exports = withAutomaticUiStyle;
