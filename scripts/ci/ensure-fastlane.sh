#!/usr/bin/env bash
# Install Fastlane via Bundler into scripts/ci/vendor/bundle (idempotent).
# Usage: source scripts/ci/ensure-fastlane.sh   OR   bash scripts/ci/ensure-fastlane.sh
#
# - Pin Bundler 2.6.9 (Gemfile.lock BUNDLED WITH; avoid Bundler 1.x / untaint).
# - Put only the Fastlane binstub on PATH (EAS iOS spawns `fastlane` during build).
# - Do NOT wrap `bundle` as a function that injects `_2.6.9_` after vendor/bin is on
#   PATH — a vendored `bundle` stub then treats `_2.6.9_` as a subcommand
#   ("Could not find command \"_2.6.9_\"").
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

# Absolute path to the real Bundler CLI *before* we prepend vendor/bin.
# Prefer the 2.6.9 executable if RubyGems exposes a versioned bindir entry.
_BUNDLE_BIN="$(
  "${_ruby_bin}" -e '
    begin
      spec = Gem::Specification.find_by_name("bundler", Gem::Requirement.new("= 2.6.9"))
      candidates = [
        File.join(spec.full_gem_path, "exe", "bundle"),
        File.join(Gem.bindir, "bundle"),
      ]
      hit = candidates.find { |p| File.executable?(p) }
      abort "bundler 2.6.9 executable not found" unless hit
      print hit
    rescue Gem::LoadError
      abort "bundler 2.6.9 gem not installed"
    end
  '
)"

echo "Using Bundler: ${_BUNDLE_BIN} ($("${_BUNDLE_BIN}" -v))"

# Drop a leftover shell function from an older ensure-fastlane (same shell / retries).
unset -f bundle 2>/dev/null || true

"${_BUNDLE_BIN}" config unset --local bin 2>/dev/null || true
"${_BUNDLE_BIN}" config set --local path 'vendor/bundle'
"${_BUNDLE_BIN}" install --jobs 4 --retry 3
# Only Fastlane on PATH — do not binstub `bundle` into vendor/bin.
"${_BUNDLE_BIN}" binstubs fastlane --force --path vendor/bin

# Prefer Fastlane binstub; keep the real Bundler ahead of any accidental vendor/bin/bundle.
export PATH="${_CI_DIR}/vendor/bin:$(dirname "${_BUNDLE_BIN}"):${PATH}"
hash -r 2>/dev/null || true

if [[ ! -x "${_CI_DIR}/vendor/bin/fastlane" ]]; then
  echo "ERROR: missing ${_CI_DIR}/vendor/bin/fastlane" >&2
  ls -la "${_CI_DIR}/vendor/bin" >&2 || true
  exit 1
fi

# Callers should use `fastlane` from PATH (not `bundle exec`), so EAS and supply/pilot share one entrypoint.
# shellcheck disable=SC2034
FASTLANE=(fastlane)
export CI_BUNDLE_BIN="${_BUNDLE_BIN}"
echo "Fastlane on PATH: $(command -v fastlane) ($(fastlane --version | head -1))"
