const { withGradleProperties } = require('expo/config-plugins');

const OPTIMIZED_RESOURCE_SHRINKING = 'android.r8.optimizedResourceShrinking';
const GRADLE_JVMARGS = 'org.gradle.jvmargs';

/** Enough Metaspace for AGP 8.12 + R8 minify on local EAS builds (default 512m OOMs). */
const GRADLE_JVMARGS_VALUE =
  '-Xmx4g -XX:MaxMetaspaceSize=1g -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8';

/**
 * @param {import('@expo/config-plugins').GradlePropertiesConfig['modResults']} props
 * @param {string} key
 * @param {string} value
 */
function upsertGradleProperty(props, key, value) {
  const existing = props.findIndex((item) => item.type === 'property' && item.key === key);
  const entry = { type: 'property', key, value };
  if (existing >= 0) {
    props[existing] = entry;
  } else {
    props.push(entry);
  }
}

/**
 * Production Android: AGP optimized resource shrinking + Gradle JVM sized for R8.
 * @see https://developer.android.com/topic/performance/app-optimization/enable-app-optimization
 */
module.exports = function withAndroidR8Optimizations(config) {
  return withGradleProperties(config, (config) => {
    const props = config.modResults;
    upsertGradleProperty(props, OPTIMIZED_RESOURCE_SHRINKING, 'true');
    upsertGradleProperty(props, GRADLE_JVMARGS, GRADLE_JVMARGS_VALUE);
    return config;
  });
};
