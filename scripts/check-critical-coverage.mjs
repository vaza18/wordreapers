#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(rootDir, 'scripts/critical-coverage-files.json');
const lcovPath = path.join(rootDir, 'coverage/lcov.info');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const minPct = manifest.minStatementsPct ?? 90;
const explicitFiles = manifest.files ?? [];
const globPatterns = manifest.globs ?? [];

/** Match a repo-relative path against a simple glob (`*` = any chars except `/`). */
function matchGlob(pattern, file) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`).test(file);
}

/** Parse Vitest lcov output into per-file line hit counts. */
function parseLcov(content) {
  const records = new Map();
  let current = null;

  for (const line of content.split('\n')) {
    if (line.startsWith('SF:')) {
      const filePath = line.slice(3).trim();
      const relative = path.relative(rootDir, filePath).replaceAll('\\', '/');
      current = relative;
      records.set(relative, { found: 0, hit: 0 });
      continue;
    }
    if (!current) {
      continue;
    }
    if (line.startsWith('LF:')) {
      records.get(current).found = Number(line.slice(3));
    } else if (line.startsWith('LH:')) {
      records.get(current).hit = Number(line.slice(3));
    } else if (line === 'end_of_record') {
      current = null;
    }
  }

  return records;
}

/** Merge explicit manifest paths with lcov files matched by glob patterns. */
function resolveCriticalTargets(records) {
  const fromGlobs = [...records.keys()].filter((file) =>
    globPatterns.some((pattern) => matchGlob(pattern, file)),
  );
  return [...new Set([...explicitFiles, ...fromGlobs])].sort();
}

let lcov;
try {
  lcov = readFileSync(lcovPath, 'utf8');
} catch {
  console.error(`Missing ${lcovPath}. Run npm run test:coverage first.`);
  process.exit(1);
}

const records = parseLcov(lcov);
const targets = resolveCriticalTargets(records);
const failures = [];

for (const file of targets) {
  const stats = records.get(file);
  if (!stats) {
    failures.push(`${file}: not present in coverage report`);
    continue;
  }
  const pct = stats.found === 0 ? 100 : (stats.hit / stats.found) * 100;
  if (pct < minPct) {
    failures.push(`${file}: ${pct.toFixed(1)}% lines (${stats.hit}/${stats.found}) < ${minPct}%`);
  }
}

if (failures.length > 0) {
  console.error('Critical coverage gate failed:\n');
  for (const line of failures) {
    console.error(`  - ${line}`);
  }
  process.exit(1);
}

const globCount = targets.length - explicitFiles.length;
const globNote =
  globPatterns.length > 0 ? ` (${explicitFiles.length} explicit + ${globCount} from globs)` : '';
console.log(`Critical coverage OK for ${targets.length} files${globNote} (>= ${minPct}% lines).`);
