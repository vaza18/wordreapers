#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d functions/node_modules/firebase-admin ]; then
  echo "→ Install Cloud Functions dependencies"
  npm ci --prefix functions
fi

echo "→ Prepare dictionary stubs for typecheck"
npm run dict:stub

echo "→ Dictionary validation regression cases"
npm run dict:validate

echo "→ ESLint"
npm run lint

echo "→ Prettier"
npm run format:check

echo "→ Typecheck"
npm run typecheck

echo "→ Unit tests"
npm test

echo "✓ CI checks passed"
