#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ Prepare dictionary stubs for typecheck"
npm run dict:stub

echo "→ ESLint"
npm run lint

echo "→ Prettier"
npm run format:check

echo "→ Typecheck"
npm run typecheck

echo "→ Unit tests"
npm test

echo "✓ CI checks passed"
