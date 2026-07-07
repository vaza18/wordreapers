#!/usr/bin/env node
/**
 * Pre-commit gate: risky-zone code changes must touch at least one test file.
 * Opt out: commit message contains [skip-test-check] or SKIP_TEST_TOUCH_CHECK=1.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RISKY_PREFIXES = ['lib/online/', 'firebase/', 'functions/src/'];
const TEST_PREFIX = 'tests/';

/** Staged paths for the upcoming commit. */
function getStagedFiles() {
  try {
    return execSync('git diff --cached --name-only --diff-filter=ACMR', {
      cwd: rootDir,
      encoding: 'utf8',
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Whether the gate is skipped via env or commit message. */
function shouldSkip() {
  if (process.env.SKIP_TEST_TOUCH_CHECK === '1') {
    return true;
  }
  try {
    const msg = readFileSync(path.join(rootDir, '.git/COMMIT_EDITMSG'), 'utf8');
    return msg.includes('[skip-test-check]');
  } catch {
    return false;
  }
}

/** True when the path is under a risky prefix. */
function isRisky(file) {
  return RISKY_PREFIXES.some((prefix) => file.startsWith(prefix));
}

/** True when the path is under tests/. */
function isTest(file) {
  return file.startsWith(TEST_PREFIX);
}

const staged = getStagedFiles();
if (staged.length === 0 || shouldSkip()) {
  process.exit(0);
}

const riskyChanges = staged.filter(isRisky);
if (riskyChanges.length === 0) {
  process.exit(0);
}

const testChanges = staged.filter(isTest);
if (testChanges.length > 0) {
  process.exit(0);
}

console.error('Risky-zone change without test update:\n');
for (const file of riskyChanges) {
  console.error(`  - ${file}`);
}
console.error(
  '\nAdd or update a test under tests/, or opt out with [skip-test-check] in the commit message.',
);
process.exit(1);
