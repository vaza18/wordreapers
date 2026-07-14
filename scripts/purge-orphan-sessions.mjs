#!/usr/bin/env node
/**
 * One-shot Admin wipe of abandoned waiting/playing (and finished without purgeAfterAt)
 * game sessions plus related session_word_maps / player_words.
 *
 * Loads `EXPO_PUBLIC_FIREBASE_DATABASE_URL` from `.env` / `.env.local` (repo root).
 * Precedence: shell env > `.env.local` > `.env`.
 *
 * Auth (Firebase Admin — `firebase login` is NOT enough):
 *   gcloud auth application-default login
 *   # or: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *
 * Usage:
 *   npm run firebase:purge-orphans
 *   DRY_RUN=1 npm run firebase:purge-orphans
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import { parse as parseEnv } from 'dotenv';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

/**
 * Apply `.env` then `.env.local` (local wins). Does not overwrite keys already set in the shell.
 */
function loadRepoEnvFiles() {
  const merged = {};
  for (const name of ['.env', '.env.local']) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) {
      continue;
    }
    Object.assign(merged, parseEnv(readFileSync(path)));
  }
  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined && value !== undefined) {
      process.env[key] = value;
    }
  }
}

loadRepoEnvFiles();

const admin = require(join(__dirname, '../functions/node_modules/firebase-admin'));

const FINISHED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const ABANDONED_RETENTION_MS = FINISHED_RETENTION_MS;

const CREDENTIAL_HELP = `Firebase Admin needs Google Application Default Credentials.
\`firebase login\` is not enough for this script.

Pick one:
  1) gcloud auth application-default login
  2) export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json

Then re-run: DRY_RUN=1 npm run firebase:purge-orphans`;

/** Finished sessions past purgeAfterAt. */
function shouldPurgeFinishedSession(session, now) {
  return typeof session.purgeAfterAt === 'number' && session.purgeAfterAt <= now;
}

/** Abandoned waiting/playing rooms (and finished without TTL). */
function shouldPurgeAbandonedSession(session, now) {
  if (shouldPurgeFinishedSession(session, now)) {
    return false;
  }
  if (typeof session.purgeAfterAt === 'number' && session.purgeAfterAt > now) {
    return false;
  }
  const status = session.status;
  if (status === 'finished') {
    return typeof session.purgeAfterAt !== 'number';
  }
  if (status !== 'waiting' && status !== 'playing') {
    return false;
  }
  if (typeof session.createdAt !== 'number') {
    return true;
  }
  if (status === 'waiting') {
    return session.createdAt + ABANDONED_RETENTION_MS <= now;
  }
  const anchor =
    typeof session.roundStartedAt === 'number' ? session.roundStartedAt : session.createdAt;
  return anchor + ABANDONED_RETENTION_MS <= now;
}

/** True when finished TTL or abandoned retention has elapsed. */
function shouldPurgeSession(session, now) {
  return shouldPurgeFinishedSession(session, now) || shouldPurgeAbandonedSession(session, now);
}

function resolveCredentialPath() {
  const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (fromEnv) {
    return { kind: 'env', path: fromEnv, exists: existsSync(fromEnv) };
  }
  const adcPath = join(homedir(), '.config/gcloud/application_default_credentials.json');
  return { kind: 'adc', path: adcPath, exists: existsSync(adcPath) };
}

function isCredentialError(error) {
  const message = String(error?.message ?? error ?? '');
  return (
    message.includes('Could not load the default credentials') ||
    message.includes('invalid-credential') ||
    message.includes('Failed to determine project ID') ||
    error?.code === 'app/invalid-credential'
  );
}

/** Run one-shot orphan purge against production/dev RTDB. */
async function main() {
  const databaseURL =
    process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL?.trim() ||
    process.env.FIREBASE_DATABASE_URL?.trim();
  if (!databaseURL) {
    console.error(
      'Missing EXPO_PUBLIC_FIREBASE_DATABASE_URL — set it in .env / .env.local (see .env.example).',
    );
    process.exit(1);
  }

  const credential = resolveCredentialPath();
  if (!credential.exists) {
    if (credential.kind === 'env') {
      console.error(
        `GOOGLE_APPLICATION_CREDENTIALS points to a missing file:\n  ${credential.path}\n\nDownload a real service-account JSON from Firebase Console → Project settings → Service accounts,\nthen:\n  export GOOGLE_APPLICATION_CREDENTIALS=/Users/you/Downloads/your-project-firebase-adminsdk.json\n\nOr use ADC instead:\n  unset GOOGLE_APPLICATION_CREDENTIALS\n  gcloud auth application-default login`,
      );
    } else {
      console.error(CREDENTIAL_HELP);
    }
    process.exit(1);
  }

  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
  const now = Date.now();

  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL,
      });
    }
  } catch (error) {
    if (isCredentialError(error)) {
      console.error(CREDENTIAL_HELP);
      process.exit(1);
    }
    throw error;
  }

  const db = admin.database();

  let snap;
  try {
    snap = await db.ref('game_sessions').once('value');
  } catch (error) {
    if (isCredentialError(error)) {
      console.error(CREDENTIAL_HELP);
      process.exit(1);
    }
    throw error;
  }

  if (!snap.exists()) {
    console.log('No game_sessions found.');
    return;
  }

  const toPurge = [];
  snap.forEach((child) => {
    const gameId = child.key;
    if (!gameId) {
      return;
    }
    const session = child.val() ?? {};
    if (shouldPurgeSession(session, now)) {
      toPurge.push({ gameId, status: session.status ?? '(none)', createdAt: session.createdAt });
    }
  });

  console.log(`Candidates: ${toPurge.length} (dryRun=${dryRun})`);
  for (const row of toPurge) {
    console.log(`- ${row.gameId} status=${row.status} createdAt=${row.createdAt ?? 'missing'}`);
  }

  if (dryRun || toPurge.length === 0) {
    return;
  }

  let purged = 0;
  for (const { gameId } of toPurge) {
    await db.ref().update({
      [`game_sessions/${gameId}`]: null,
      [`session_word_maps/${gameId}`]: null,
      [`player_words/${gameId}`]: null,
    });
    purged += 1;
  }
  console.log(`Purged ${purged} sessions.`);
}

main().catch((error) => {
  if (isCredentialError(error)) {
    console.error(CREDENTIAL_HELP);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});
