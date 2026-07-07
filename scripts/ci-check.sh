#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d functions/node_modules/firebase-admin ]; then
  echo "→ Install Cloud Functions dependencies"
  npm ci --prefix functions
fi

echo "→ ESLint"
npm run lint

echo "→ Prettier"
npm run format:check

echo "→ Typecheck"
npm run typecheck

echo "→ Unit tests with coverage gate"
npm run test:coverage

echo "→ Critical module coverage gate"
node scripts/check-critical-coverage.mjs

echo "✓ CI checks passed"
