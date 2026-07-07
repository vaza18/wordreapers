#!/usr/bin/env node
/**
 * One-time refactor: group lib/online/*.ts into domain subfolders.
 * Run from repo root: node scripts/restructure-lib-online.mjs
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const onlineDir = path.join(rootDir, 'lib/online');

const SUBDIRS = {
  rematch: [
    'bootstrap-rematch-waiting-from-archive.ts',
    'build-rematch-waiting-session.ts',
    'plan-rematch-action.ts',
    'rematch-toast-events.ts',
    'rematch-waiting-lobby.ts',
    'resolve-rematch-navigation-route.ts',
    'restart-rematch-online-round.ts',
    'opt-into-live-round.ts',
  ],
  presence: [
    'presence-handoff.ts',
    'reconcile-player-presence.ts',
    'session-offline.ts',
    'session-participants.ts',
    'session-presence.ts',
    'use-player-online-presence.ts',
    'live-round-membership.ts',
    'active-round-players.ts',
    'player-for-round-start.ts',
    'players-patch-for-round-start.ts',
  ],
  session: [
    'rejoin-online-round.ts',
    'play-session-bootstrap.ts',
    'session-words-bootstrap.ts',
    'online-session-archive.ts',
    'processed-online-rounds.ts',
    'archive-finished-round-from-firebase.ts',
    'clone-player-words.ts',
    'complete-pending-round-archive.ts',
    'pending-round-archive.ts',
    'restore-finished-round-to-firebase.ts',
    'restore-session-words-to-rtdb.ts',
    'cache-active-round.ts',
    'active-round-cache.ts',
    'load-frozen-round-with-retry.ts',
    'frozen-finished-round.ts',
    'frozen-round-view.ts',
    'is-reviewing-prior-round-on-play.ts',
    'resolve-round-end-session-snapshot.ts',
  ],
  voting: [
    'early-finish-vote.ts',
    'add-time-vote.ts',
    'pause-vote.ts',
    'resume-vote.ts',
    'play-vote-banner.ts',
    'viewer-needs-session-vote.ts',
    'voting-player-ids.ts',
  ],
};

/** Basename -> repo-relative `lib/online/...` path without extension. */
const modulePaths = new Map();

/** Populate `modulePaths` from SUBDIRS and the current on-disk layout. */
function registerModules() {
  for (const [subdir, files] of Object.entries(SUBDIRS)) {
    for (const file of files) {
      modulePaths.set(
        file.replace(/\.ts$/, ''),
        `lib/online/${subdir}/${file.replace(/\.ts$/, '')}`,
      );
    }
  }
  for (const entry of readdirSync(onlineDir)) {
    const full = path.join(onlineDir, entry);
    if (statSync(full).isFile() && entry.endsWith('.ts')) {
      const base = entry.replace(/\.ts$/, '');
      if (!modulePaths.has(base)) {
        modulePaths.set(base, `lib/online/${base}`);
      }
    }
    if (statSync(full).isDirectory() && Object.hasOwn(SUBDIRS, entry)) {
      for (const subEntry of readdirSync(full)) {
        if (subEntry.endsWith('.ts')) {
          const base = subEntry.replace(/\.ts$/, '');
          modulePaths.set(base, `lib/online/${entry}/${base}`);
        }
      }
    }
  }
}

/** Relative import path from `fromFile` to `toModulePath` (posix, with `./` prefix). */
function posixRelative(fromFile, toModulePath) {
  const fromDir = path.posix.dirname(fromFile.replaceAll('\\', '/'));
  let rel = path.posix.relative(fromDir, toModulePath).replaceAll('\\', '/');
  if (!rel.startsWith('.')) {
    rel = `./${rel}`;
  }
  return rel;
}

/** Resolve `@/` or relative import specifiers to a repo-relative module path. */
function resolveImportSpecifier(specifier, fromFile) {
  if (specifier.startsWith('@/')) {
    return specifier.slice(2).replace(/\.js$/, '');
  }
  if (specifier.startsWith('.')) {
    const fromDir = path.dirname(fromFile);
    return path.normalize(path.join(fromDir, specifier)).replaceAll('\\', '/').replace(/\.js$/, '');
  }
  return null;
}

/** Extract the `lib/online/...` file basename from a resolved module path. */
function moduleBaseFromPath(resolved) {
  const normalized = resolved.replaceAll('\\', '/');
  const match = normalized.match(/lib\/online\/(?:.+?\/)?([^/]+)$/);
  return match?.[1] ?? null;
}

/** Rewrite `lib/online` imports in one source file after the directory move. */
function rewriteFile(filePath) {
  const relFile = path.relative(rootDir, filePath).replaceAll('\\', '/');
  let content = readFileSync(filePath, 'utf8');
  const importRe = /from\s+['"]([^'"]+)['"]/g;
  let changed = false;

  content = content.replace(importRe, (full, specifier) => {
    const usesAlias = specifier.startsWith('@/');
    const resolved = resolveImportSpecifier(specifier, relFile);
    if (!resolved) {
      return full;
    }
    const base = moduleBaseFromPath(resolved);
    if (!base || !modulePaths.has(base)) {
      return full;
    }
    const targetModule = modulePaths.get(base);
    let newSpecifier;
    if (usesAlias) {
      newSpecifier = `@/${targetModule}`;
    } else {
      newSpecifier = posixRelative(relFile, targetModule);
    }
    if (specifier.endsWith('.js')) {
      newSpecifier = `${newSpecifier}.js`;
    }
    if (newSpecifier === specifier) {
      return full;
    }
    changed = true;
    return `from '${newSpecifier}'`;
  });

  if (changed) {
    writeFileSync(filePath, content);
  }
}

/** Recursively collect `.ts`, `.tsx`, `.md`, `.mdc`, and `.json` files under `dir`. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'coverage' || entry === '.git') {
      continue;
    }
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx|md|mdc|json)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** `git mv` online modules into domain subfolders per SUBDIRS. */
function moveFiles() {
  for (const subdir of Object.keys(SUBDIRS)) {
    execSync(`mkdir -p "${path.join(onlineDir, subdir)}"`, { cwd: rootDir });
  }
  for (const [subdir, files] of Object.entries(SUBDIRS)) {
    for (const file of files) {
      const src = path.join(onlineDir, file);
      const dest = path.join(onlineDir, subdir, file);
      execSync(`git mv "${src}" "${dest}"`, { cwd: rootDir });
    }
  }
}

registerModules();
moveFiles();
registerModules();

for (const file of walk(rootDir)) {
  rewriteFile(file);
}

console.log('lib/online restructure complete. Run npm run ci:check.');
