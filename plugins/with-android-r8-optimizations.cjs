const { withGradleProperties } = require('expo/config-plugins');

const OPTIMIZED_RESOURCE_SHRINKING = 'android.r8.optimizedResourceShrinking';

/**
 * Enable AGP 8.12+ optimized resource shrinking (production builds only).
 * @see https://developer.android.com/topic/performance/app-optimization/enable-app-optimization
 */
module.exports = function withAndroidR8Optimizations(config) {
  return withGradleProperties(config, (config) => {
    const props = config.modResults;
    const existing = props.findIndex(
      (item) => item.type === 'property' && item.key === OPTIMIZED_RESOURCE_SHRINKING,
    );

    const entry = { type: 'property', key: OPTIMIZED_RESOURCE_SHRINKING, value: 'true' };

    if (existing >= 0) {
      props[existing] = entry;
    } else {
      props.push(entry);
    }

    return config;
  });
};
