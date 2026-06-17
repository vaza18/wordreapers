# Source before `npx expo run:android` on macOS:
#   source scripts/android-env.sh
#
# Android Studio ships a JDK (JBR); Gradle needs JAVA_HOME.

if [[ "$(uname)" == "Darwin" ]]; then
  AS_JBR="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  if [[ -x "$AS_JBR/bin/java" ]]; then
    export JAVA_HOME="$AS_JBR"
  fi
fi

if [[ -z "${ANDROID_HOME:-}" ]] && [[ -d "$HOME/Library/Android/sdk" ]]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
fi

if [[ -n "${ANDROID_HOME:-}" ]]; then
  export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
  if [[ -d "$ANDROID_HOME/cmdline-tools/latest/bin" ]]; then
    export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin"
  fi
fi
