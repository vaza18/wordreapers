#!/usr/bin/env bash
# Install Fastlane via Bundler into scripts/ci/vendor/bundle (idempotent).
# Usage: source scripts/ci/ensure-fastlane.sh   OR   bash scripts/ci/ensure-fastlane.sh
set -euo pipefail

_CI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export BUNDLE_GEMFILE="${_CI_DIR}/Gemfile"
cd "$_CI_DIR"

if ! command -v bundle >/dev/null 2>&1; then
  echo "Installing bundler (user gem)…"
  gem install bundler --no-document --user-install
  export PATH="$(ruby -r rubygems -e 'print Gem.user_dir')/bin:${PATH}"
fi

bundle config set --local path 'vendor/bundle'
bundle install --jobs 4 --retry 3

# shellcheck disable=SC2034
FASTLANE=(bundle exec fastlane)
echo "Fastlane ready: $(bundle exec fastlane --version | head -1)"
