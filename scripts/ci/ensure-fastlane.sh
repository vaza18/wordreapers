#!/usr/bin/env bash
# Install Fastlane via Bundler into scripts/ci/vendor/bundle (idempotent).
# Usage: source scripts/ci/ensure-fastlane.sh   OR   bash scripts/ci/ensure-fastlane.sh
#
# Fastlane constrains bundler to < 3. Bundler 1.x crashes on Ruby 3.2+ (`untaint`).
# Prefer Homebrew Ruby when present; always invoke Bundler as `bundle _2.6.9_`.
set -euo pipefail

_CI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export BUNDLE_GEMFILE="${_CI_DIR}/Gemfile"
cd "$_CI_DIR"

# Prefer a modern Ruby (macOS system Ruby 2.6 cannot install gems without sudo).
if [[ -x /opt/homebrew/opt/ruby/bin/ruby ]]; then
  export PATH="/opt/homebrew/opt/ruby/bin:${PATH}"
elif [[ -x /usr/local/opt/ruby/bin/ruby ]]; then
  export PATH="/usr/local/opt/ruby/bin:${PATH}"
fi

_ruby_bin="$(command -v ruby)"
_gem_bin="$(command -v gem)"
echo "Using Ruby: $("${_ruby_bin}" -v)"

if ! "${_gem_bin}" list -i bundler -v '2.6.9' >/dev/null 2>&1; then
  echo "Installing bundler 2.6.9 (fastlane-compatible; bundler < 3)…"
  "${_gem_bin}" install bundler -v 2.6.9 --no-document
fi

# Pin 2.6.9 even if PATH `bundle` is 1.x or 4.x (Gemfile.lock BUNDLED WITH 2.6.9).
bundle() { command bundle _2.6.9_ "$@"; }

bundle config set --local path 'vendor/bundle'
bundle install --jobs 4 --retry 3

# shellcheck disable=SC2034
FASTLANE=(bundle exec fastlane)
echo "Fastlane ready: $(bundle exec fastlane --version | head -1)"
