#!/usr/bin/env bash
# Install Fastlane via Bundler into scripts/ci/vendor/bundle (idempotent).
# Usage: source scripts/ci/ensure-fastlane.sh   OR   bash scripts/ci/ensure-fastlane.sh
#
# Bundler 1.x crashes on Ruby 3.2+ (`untaint`). Pin Bundler 2.6.9.
# Also exports `fastlane` on PATH — local `eas build --platform ios` spawns it
# directly (`spawn fastlane ENOENT` if missing).
set -euo pipefail

_CI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export BUNDLE_GEMFILE="${_CI_DIR}/Gemfile"
cd "$_CI_DIR"

# Prefer Homebrew Ruby only when the active interpreter is too old (macOS system 2.6).
# Do not override ruby/setup-ruby on CI (PATH already has 3.3+).
if ! ruby -e 'exit RUBY_VERSION.to_f >= 3.2 ? 0 : 1' 2>/dev/null; then
  if [[ -x /opt/homebrew/opt/ruby/bin/ruby ]]; then
    export PATH="/opt/homebrew/opt/ruby/bin:${PATH}"
  elif [[ -x /usr/local/opt/ruby/bin/ruby ]]; then
    export PATH="/usr/local/opt/ruby/bin:${PATH}"
  fi
fi

_ruby_bin="$(command -v ruby)"
_gem_bin="$(command -v gem)"
echo "Using Ruby: $("${_ruby_bin}" -v)"

if ! "${_gem_bin}" list -i bundler -v '2.6.9' >/dev/null 2>&1; then
  echo "Installing bundler 2.6.9…"
  "${_gem_bin}" install bundler -v 2.6.9 --no-document
fi

# Pin 2.6.9 even if PATH `bundle` is 1.x or 4.x (Gemfile.lock BUNDLED WITH 2.6.9).
bundle() { command bundle _2.6.9_ "$@"; }

bundle config set --local path 'vendor/bundle'
# Binstubs so EAS / child processes can `spawn fastlane` without `bundle exec`.
bundle config set --local bin 'vendor/bin'
bundle install --jobs 4 --retry 3
bundle binstubs fastlane --force --path vendor/bin

export PATH="${_CI_DIR}/vendor/bin:${PATH}"
hash -r 2>/dev/null || true

if ! command -v fastlane >/dev/null 2>&1; then
  echo "ERROR: fastlane not on PATH after binstubs (expected ${_CI_DIR}/vendor/bin/fastlane)" >&2
  ls -la "${_CI_DIR}/vendor/bin" >&2 || true
  exit 1
fi

# shellcheck disable=SC2034
FASTLANE=(bundle exec fastlane)
echo "Fastlane on PATH: $(command -v fastlane) ($(fastlane --version | head -1))"
