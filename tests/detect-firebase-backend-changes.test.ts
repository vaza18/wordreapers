import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = join(process.cwd(), 'scripts/ci/detect-firebase-backend-changes.sh');
const REAL_GIT = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();

function git(cwd: string, ...args: string[]): string {
  return execFileSync(REAL_GIT, args, { cwd, encoding: 'utf8' }).trim();
}

function runDetect(
  cwd: string,
  args: string[],
  env: Record<string, string | undefined> = {},
): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('bash', [SCRIPT, ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: '', ...env },
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      status: typeof e.status === 'number' ? e.status : 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
    };
  }
}

function parseFlags(stdout: string): { deploy_rules: string; deploy_functions: string } {
  const deploy_rules = /(?:^|\n)deploy_rules=(true|false)/.exec(stdout)?.[1];
  const deploy_functions = /(?:^|\n)deploy_functions=(true|false)/.exec(stdout)?.[1];
  if (!deploy_rules || !deploy_functions) {
    throw new Error(`Could not parse flags from:\n${stdout}`);
  }
  return { deploy_rules, deploy_functions };
}

function detectAuto(cwd: string, versionTag: string, target = 'auto', force = 'false') {
  return runDetect(cwd, [
    '--current-ref',
    'HEAD',
    '--version-tag',
    versionTag,
    '--target',
    target,
    '--force',
    force,
  ]);
}

describe('detect-firebase-backend-changes.sh', () => {
  let repo: string | undefined;

  afterEach(() => {
    if (repo) {
      rmSync(repo, { recursive: true, force: true });
      repo = undefined;
    }
  });

  function initRepo(options?: { tag?: boolean }): string {
    repo = mkdtempSync(join(tmpdir(), 'wr-fb-detect-'));
    git(repo, '-c', 'init.defaultBranch=main', 'init');
    git(repo, 'config', 'user.email', 'ci@example.com');
    git(repo, 'config', 'user.name', 'CI');
    mkdirSync(join(repo, 'firebase'), { recursive: true });
    mkdirSync(join(repo, 'functions'), { recursive: true });
    writeFileSync(join(repo, 'firebase/database.rules.json'), '{"rules":{".read":false}}\n');
    writeFileSync(
      join(repo, 'firebase.json'),
      '{"database":{"rules":"firebase/database.rules.json"}}\n',
    );
    writeFileSync(join(repo, 'functions/index.js'), 'exports.ok = true;\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-m', 'base');
    if (options?.tag !== false) {
      git(repo, 'tag', 'v1.0.0');
    }
    return repo;
  }

  function bumpTag(cwd: string, tag: string): void {
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', tag);
    git(cwd, 'tag', tag);
  }

  it('no-ops when backend paths are unchanged vs previous tag', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'README.md'), 'docs only\n');
    bumpTag(cwd, 'v1.0.1');

    const result = detectAuto(cwd, 'v1.0.1');
    expect(result.status).toBe(0);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'false',
      deploy_functions: 'false',
    });
  });

  it('marks rules only when database.rules.json changes', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'firebase/database.rules.json'), '{"rules":{".read":true}}\n');
    bumpTag(cwd, 'v1.0.1');

    const result = detectAuto(cwd, 'v1.0.1');
    expect(result.status).toBe(0);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'true',
      deploy_functions: 'false',
    });
  });

  it('marks rules when a rules file is renamed under firebase/', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'firebase/database.rules.json'), '{"rules":{".read":true}}\n');
    bumpTag(cwd, 'v1.0.1');
    unlinkSync(join(cwd, 'firebase/database.rules.json'));
    writeFileSync(join(cwd, 'firebase/rules.json'), '{"rules":{".read":true}}\n');
    writeFileSync(join(cwd, 'firebase.json'), '{"database":{"rules":"firebase/rules.json"}}\n');
    git(cwd, 'add', '-A');
    git(cwd, 'commit', '-m', 'rename rules');
    git(cwd, 'tag', 'v1.0.2');

    const result = detectAuto(cwd, 'v1.0.2');
    expect(result.status).toBe(0);
    // firebase.json change → both; rename under firebase/ alone would still set rules.
    expect(parseFlags(result.stdout).deploy_rules).toBe('true');
    expect(parseFlags(result.stdout).deploy_functions).toBe('true');
  });

  it('marks rules on follow-up edit after rename under firebase/', () => {
    const cwd = initRepo();
    unlinkSync(join(cwd, 'firebase/database.rules.json'));
    writeFileSync(join(cwd, 'firebase/rules.json'), '{"rules":{".read":false}}\n');
    writeFileSync(join(cwd, 'firebase.json'), '{"database":{"rules":"firebase/rules.json"}}\n');
    git(cwd, 'add', '-A');
    git(cwd, 'commit', '-m', 'already renamed');
    git(cwd, 'tag', 'v1.0.1');

    writeFileSync(join(cwd, 'firebase/rules.json'), '{"rules":{".read":true}}\n');
    bumpTag(cwd, 'v1.0.2');

    const result = detectAuto(cwd, 'v1.0.2');
    expect(result.status).toBe(0);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'true',
      deploy_functions: 'false',
    });
  });

  it('marks functions only for nested functions/src path changes', () => {
    const cwd = initRepo();
    mkdirSync(join(cwd, 'functions/src'), { recursive: true });
    writeFileSync(join(cwd, 'functions/src/index.ts'), 'export const n = 1;\n');
    bumpTag(cwd, 'v1.0.1');

    const result = detectAuto(cwd, 'v1.0.1');
    expect(result.status).toBe(0);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'false',
      deploy_functions: 'true',
    });
  });

  it('marks functions when scripts/dictionary changes (CF dict allowlist source)', () => {
    const cwd = initRepo();
    mkdirSync(join(cwd, 'scripts/dictionary'), { recursive: true });
    writeFileSync(join(cwd, 'scripts/dictionary/whitelist.txt'), 'слово\n');
    bumpTag(cwd, 'v1.0.1');

    const result = detectAuto(cwd, 'v1.0.1');
    expect(result.status).toBe(0);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'false',
      deploy_functions: 'true',
    });
  });

  it('marks functions when a functions path is deleted', () => {
    const cwd = initRepo();
    mkdirSync(join(cwd, 'functions/src'), { recursive: true });
    writeFileSync(join(cwd, 'functions/src/gone.ts'), 'export const x = 1;\n');
    bumpTag(cwd, 'v1.0.1');
    unlinkSync(join(cwd, 'functions/src/gone.ts'));
    git(cwd, 'add', '-A');
    git(cwd, 'commit', '-m', 'delete fn');
    git(cwd, 'tag', 'v1.0.2');

    const result = detectAuto(cwd, 'v1.0.2');
    expect(result.status).toBe(0);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'false',
      deploy_functions: 'true',
    });
  });

  it('logs when target filters the deploy set to empty', () => {
    const cwd = initRepo();
    mkdirSync(join(cwd, 'functions/src'), { recursive: true });
    writeFileSync(join(cwd, 'functions/src/index.ts'), 'export const n = 1;\n');
    bumpTag(cwd, 'v1.0.1');

    const result = detectAuto(cwd, 'v1.0.1', 'rules');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/No backend deploy selected/);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'false',
      deploy_functions: 'false',
    });
  });

  it('marks both when firebase.json changes', () => {
    const cwd = initRepo();
    writeFileSync(
      join(cwd, 'firebase.json'),
      '{"database":{"rules":"firebase/database.rules.json"},"functions":[]}\n',
    );
    bumpTag(cwd, 'v1.0.1');

    const result = detectAuto(cwd, 'v1.0.1');
    expect(result.status).toBe(0);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'true',
      deploy_functions: 'true',
    });
  });

  it('MODE=first treats untagged repo as all changed', () => {
    const cwd = initRepo({ tag: false });
    const result = runDetect(cwd, [
      '--current-ref',
      'HEAD',
      '--target',
      'auto',
      '--force',
      'false',
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/mode=first|No previous vX\.Y\.Z tag/);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'true',
      deploy_functions: 'true',
    });
  });

  it('only self-tags without --version-tag treat as first release', () => {
    const cwd = initRepo();
    // Tip is tagged v1.0.0 only — self-tag must not become PREV (empty diff).
    const result = runDetect(cwd, [
      '--current-ref',
      'HEAD',
      '--target',
      'auto',
      '--force',
      'false',
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/mode=first|Only v\* tag/);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'true',
      deploy_functions: 'true',
    });
  });

  it('fails without --force when no ancestor v* tag exists', () => {
    const cwd = initRepo();
    // Orphan tip: has other tags in the repo but none are ancestors of HEAD.
    git(cwd, 'checkout', '--orphan', 'orphan');
    writeFileSync(join(cwd, 'only-orphan.txt'), 'x\n');
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'orphan');

    const result = runDetect(cwd, [
      '--current-ref',
      'HEAD',
      '--target',
      'auto',
      '--force',
      'false',
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/No ancestor vX\.Y\.Z tag/);
  });

  it('no-ancestor + --force skips baseline and deploys both', () => {
    const cwd = initRepo();
    git(cwd, 'checkout', '--orphan', 'orphan');
    writeFileSync(join(cwd, 'only-orphan.txt'), 'x\n');
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'orphan');

    const result = runDetect(cwd, ['--current-ref', 'HEAD', '--target', 'auto', '--force', 'true']);
    expect(result.status).toBe(0);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'true',
      deploy_functions: 'true',
    });
  });

  it('narrows to rules when target=rules even if functions also changed', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'firebase/database.rules.json'), '{"rules":{".read":true}}\n');
    mkdirSync(join(cwd, 'functions/src'), { recursive: true });
    writeFileSync(join(cwd, 'functions/src/index.ts'), 'export const n = 1;\n');
    bumpTag(cwd, 'v1.0.1');

    const result = detectAuto(cwd, 'v1.0.1', 'rules');
    expect(result.status).toBe(0);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'true',
      deploy_functions: 'false',
    });
  });

  it('narrows to functions when target=functions even if rules also changed', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'firebase/database.rules.json'), '{"rules":{".read":true}}\n');
    mkdirSync(join(cwd, 'functions/src'), { recursive: true });
    writeFileSync(join(cwd, 'functions/src/index.ts'), 'export const n = 1;\n');
    bumpTag(cwd, 'v1.0.1');

    const result = detectAuto(cwd, 'v1.0.1', 'functions');
    expect(result.status).toBe(0);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'false',
      deploy_functions: 'true',
    });
  });

  it('fails closed on unknown --version-tag', () => {
    const cwd = initRepo();
    const result = detectAuto(cwd, 'v0.0.0');
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/Unknown --version-tag/);
  });

  it('force deploys both even when unchanged', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'README.md'), 'docs\n');
    bumpTag(cwd, 'v1.0.1');

    const result = detectAuto(cwd, 'v1.0.1', 'auto', 'true');
    expect(result.status).toBe(0);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'true',
      deploy_functions: 'true',
    });
  });

  it('fails closed when git diff exits non-zero (not a silent no-op)', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'README.md'), 'docs\n');
    bumpTag(cwd, 'v1.0.1');

    const bin = join(cwd, '.bin');
    mkdirSync(bin);
    const wrapper = join(bin, 'git');
    writeFileSync(
      wrapper,
      `#!/usr/bin/env bash
if [[ "$1" == "diff" ]]; then
  echo "fatal: simulated bad revision" >&2
  exit 128
fi
exec "${REAL_GIT}" "$@"
`,
    );
    chmodSync(wrapper, 0o755);

    const result = runDetect(
      cwd,
      ['--current-ref', 'HEAD', '--version-tag', 'v1.0.1', '--target', 'auto', '--force', 'false'],
      { PATH: `${bin}:${process.env.PATH ?? ''}` },
    );
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toMatch(/deploy_rules=false/);
  });

  it('tagged HEAD without --version-tag skips self-tag and diffs vs previous', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'firebase/database.rules.json'), '{"rules":{".read":true}}\n');
    bumpTag(cwd, 'v1.0.1');

    const withExplicit = detectAuto(cwd, 'v1.0.1');
    const withoutTag = runDetect(cwd, [
      '--current-ref',
      'HEAD',
      '--target',
      'auto',
      '--force',
      'false',
    ]);
    expect(withExplicit.status).toBe(0);
    expect(withoutTag.status).toBe(0);
    expect(parseFlags(withoutTag.stdout)).toEqual(parseFlags(withExplicit.stdout));
    expect(parseFlags(withoutTag.stdout)).toEqual({
      deploy_rules: 'true',
      deploy_functions: 'false',
    });
  });

  it('target=both without force stays selective (same as auto)', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'firebase/database.rules.json'), '{"rules":{".read":true}}\n');
    bumpTag(cwd, 'v1.0.1');

    const result = detectAuto(cwd, 'v1.0.1', 'both', 'false');
    expect(result.status).toBe(0);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'true',
      deploy_functions: 'false',
    });
  });

  it('target=both with force deploys both even when unchanged', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'README.md'), 'docs\n');
    bumpTag(cwd, 'v1.0.1');

    const result = detectAuto(cwd, 'v1.0.1', 'both', 'true');
    expect(result.status).toBe(0);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'true',
      deploy_functions: 'true',
    });
  });

  it('force + target=rules deploys only rules when unchanged', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'README.md'), 'docs\n');
    bumpTag(cwd, 'v1.0.1');

    const result = detectAuto(cwd, 'v1.0.1', 'rules', 'true');
    expect(result.status).toBe(0);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'true',
      deploy_functions: 'false',
    });
  });

  it('force + target=functions deploys only functions when unchanged', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'README.md'), 'docs\n');
    bumpTag(cwd, 'v1.0.1');

    const result = detectAuto(cwd, 'v1.0.1', 'functions', 'true');
    expect(result.status).toBe(0);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'false',
      deploy_functions: 'true',
    });
  });

  it('--version-tag as the only / first tag treats backend as changed', () => {
    const cwd = initRepo({ tag: false });
    writeFileSync(join(cwd, 'README.md'), 'first release tip\n');
    bumpTag(cwd, 'v1.0.0');

    const result = detectAuto(cwd, 'v1.0.0');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(
      /mode=first|No previous vX\.Y\.Z tag|treating backend as changed/,
    );
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'true',
      deploy_functions: 'true',
    });
  });

  it('rejects invalid --target / --force', () => {
    const cwd = initRepo();
    const badTarget = runDetect(cwd, [
      '--current-ref',
      'HEAD',
      '--target',
      'nope',
      '--force',
      'false',
    ]);
    expect(badTarget.status).not.toBe(0);
    expect(badTarget.stderr + badTarget.stdout).toMatch(/Invalid --target/);

    const badForce = runDetect(cwd, [
      '--current-ref',
      'HEAD',
      '--target',
      'auto',
      '--force',
      'maybe',
    ]);
    expect(badForce.status).not.toBe(0);
    expect(badForce.stderr + badForce.stdout).toMatch(/Invalid --force/);
  });

  it('writes deploy flags to GITHUB_OUTPUT when set', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'README.md'), 'docs\n');
    bumpTag(cwd, 'v1.0.1');
    const outFile = join(cwd, 'github-output.txt');
    writeFileSync(outFile, '');

    const result = runDetect(
      cwd,
      ['--current-ref', 'HEAD', '--version-tag', 'v1.0.1', '--target', 'auto', '--force', 'false'],
      { GITHUB_OUTPUT: outFile },
    );
    expect(result.status).toBe(0);
    const output = readFileSync(outFile, 'utf8');
    expect(output).toMatch(/deploy_rules=false/);
    expect(output).toMatch(/deploy_functions=false/);
    expect(output).toMatch(/previous_tag=v1\.0\.0/);
  });

  it('with --version-tag skips non-ancestor older tags (hotfix branch)', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'README.md'), 'on main\n');
    bumpTag(cwd, 'v1.0.1');

    git(cwd, 'checkout', '--orphan', 'hotfix');
    writeFileSync(join(cwd, 'hotfix-only.txt'), 'x\n');
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'hotfix tip');
    git(cwd, 'tag', 'v1.0.2');

    const noForce = detectAuto(cwd, 'v1.0.2');
    expect(noForce.status).not.toBe(0);
    expect(noForce.stderr + noForce.stdout).toMatch(/No ancestor older vX\.Y\.Z tag/);

    const forced = detectAuto(cwd, 'v1.0.2', 'auto', 'true');
    expect(forced.status).toBe(0);
    expect(parseFlags(forced.stdout)).toEqual({
      deploy_rules: 'true',
      deploy_functions: 'true',
    });
  });

  it('with --version-tag skips newer orphan tag and diffs vs older ancestor (rules-only)', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'firebase/database.rules.json'), '{"rules":{".read":true}}\n');
    bumpTag(cwd, 'v1.0.1');
    const mainSha = git(cwd, 'rev-parse', 'HEAD');

    git(cwd, 'checkout', '--orphan', 'noise');
    writeFileSync(join(cwd, 'noise.txt'), 'orphan newer\n');
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'orphan tip');
    git(cwd, 'tag', 'v2.0.0');

    git(cwd, 'checkout', '--force', mainSha);

    const result = detectAuto(cwd, 'v1.0.1');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/previous_tag=v1\.0\.0/);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'true',
      deploy_functions: 'false',
    });
  });

  it('accepts uppercase --target after normalization', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'firebase/database.rules.json'), '{"rules":{".read":true}}\n');
    bumpTag(cwd, 'v1.0.1');
    const result = runDetect(cwd, [
      '--current-ref',
      'HEAD',
      '--version-tag',
      'v1.0.1',
      '--target',
      'RULES',
      '--force',
      'false',
    ]);
    expect(result.status).toBe(0);
    expect(parseFlags(result.stdout)).toEqual({
      deploy_rules: 'true',
      deploy_functions: 'false',
    });
  });

  it('MODE=first + target=rules|functions narrows deploy flags', () => {
    const cwd = initRepo({ tag: false });
    writeFileSync(join(cwd, 'README.md'), 'first\n');
    bumpTag(cwd, 'v1.0.0');

    const rulesOnly = detectAuto(cwd, 'v1.0.0', 'rules');
    expect(rulesOnly.status).toBe(0);
    expect(parseFlags(rulesOnly.stdout)).toEqual({
      deploy_rules: 'true',
      deploy_functions: 'false',
    });

    const fnOnly = detectAuto(cwd, 'v1.0.0', 'functions');
    expect(fnOnly.status).toBe(0);
    expect(parseFlags(fnOnly.stdout)).toEqual({
      deploy_rules: 'false',
      deploy_functions: 'true',
    });
  });

  it('rejects --version-tag that does not point at tip (unless --force)', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'README.md'), 'ahead of tag\n');
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'untagged tip');

    const noForce = runDetect(cwd, [
      '--current-ref',
      'HEAD',
      '--version-tag',
      'v1.0.0',
      '--target',
      'auto',
      '--force',
      'false',
    ]);
    expect(noForce.status).not.toBe(0);
    expect(noForce.stderr + noForce.stdout).toMatch(/does not point at the tip|not an ancestor/);

    const forced = runDetect(cwd, [
      '--current-ref',
      'HEAD',
      '--version-tag',
      'v1.0.0',
      '--target',
      'auto',
      '--force',
      'true',
    ]);
    expect(forced.status).toBe(0);
    expect(parseFlags(forced.stdout)).toEqual({
      deploy_rules: 'true',
      deploy_functions: 'true',
    });
  });

  it('rejects --version-tag that is not vX.Y.Z shape', () => {
    const cwd = initRepo();
    const result = runDetect(cwd, [
      '--current-ref',
      'HEAD',
      '--version-tag',
      '1.0.0',
      '--target',
      'auto',
      '--force',
      'false',
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/Invalid --version-tag/);
  });
});

describe('firebase-deploy-ci.sh', () => {
  const DEPLOY_CI = join(process.cwd(), 'scripts/ci/firebase-deploy-ci.sh');

  function runDeployCi(env: Record<string, string | undefined>): {
    status: number;
    stdout: string;
    stderr: string;
  } {
    try {
      const stdout = execFileSync('bash', [DEPLOY_CI], {
        encoding: 'utf8',
        env: { ...process.env, ...env },
      });
      return { status: 0, stdout, stderr: '' };
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return {
        status: typeof e.status === 'number' ? e.status : 1,
        stdout: e.stdout ?? '',
        stderr: e.stderr ?? '',
      };
    }
  }

  it('no-ops when both deploy flags are false', () => {
    const result = runDeployCi({
      DEPLOY_RULES: 'false',
      DEPLOY_FUNCTIONS: 'false',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'demo',
      FIREBASE_SERVICE_ACCOUNT_JSON: '{}',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Nothing to deploy/);
  });

  it('fails closed when SA JSON is missing for a real deploy', () => {
    const result = runDeployCi({
      DEPLOY_RULES: 'true',
      DEPLOY_FUNCTIONS: 'false',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'demo',
      FIREBASE_SERVICE_ACCOUNT_JSON: '',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/FIREBASE_SERVICE_ACCOUNT_JSON/);
  });

  it('fails closed when project id is missing for a real deploy', () => {
    const result = runDeployCi({
      DEPLOY_RULES: 'true',
      DEPLOY_FUNCTIONS: 'false',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: '',
      FIREBASE_SERVICE_ACCOUNT_JSON: '{}',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/EXPO_PUBLIC_FIREBASE_PROJECT_ID/);
  });

  it('writes ADC temp file, unsets SA JSON, deploys rules then functions with warning, then cleans up', () => {
    const bin = mkdtempSync(join(tmpdir(), 'wr-npm-'));
    const orderFile = join(bin, 'order.txt');
    writeFileSync(orderFile, '');
    const npmPath = join(bin, 'npm');
    writeFileSync(
      npmPath,
      `#!/usr/bin/env bash
set -euo pipefail
echo "$*" >>"${orderFile}"
if [[ -n "\${FIREBASE_SERVICE_ACCOUNT_JSON:-}" ]]; then
  echo "SA_STILL_SET" >>"${orderFile}"
  exit 2
fi
if [[ -z "\${GOOGLE_APPLICATION_CREDENTIALS:-}" || ! -f "\${GOOGLE_APPLICATION_CREDENTIALS}" ]]; then
  echo "GAC_MISSING" >>"${orderFile}"
  exit 3
fi
grep -q '"type"' "\${GOOGLE_APPLICATION_CREDENTIALS}" || true
# Accept any JSON content written by the CI script.
test -s "\${GOOGLE_APPLICATION_CREDENTIALS}"
exit 0
`,
    );
    chmodSync(npmPath, 0o755);

    const sa = '{"type":"service_account","project_id":"demo"}';
    const result = runDeployCi({
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      DEPLOY_RULES: 'true',
      DEPLOY_FUNCTIONS: 'true',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'demo',
      FIREBASE_SERVICE_ACCOUNT_JSON: sa,
      RUNNER_TEMP: bin,
    });

    try {
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/::warning::RTDB rules are live/);
      expect(result.stdout).toMatch(/Firebase backend deploy finished/);
      const order = readFileSync(orderFile, 'utf8');
      expect(order).toMatch(/run firebase:deploy:rules[\s\S]*run firebase:deploy:functions/);
      expect(order).not.toMatch(/SA_STILL_SET/);
      expect(order).not.toMatch(/GAC_MISSING/);
      // Temp SA file removed by trap after script exits.
      const leftover = execFileSync(
        'bash',
        ['-lc', `ls "${bin}"/firebase-sa.*.json 2>/dev/null || true`],
        {
          encoding: 'utf8',
        },
      ).trim();
      expect(leftover).toBe('');
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  });
});

describe('firebase-deploy.sh', () => {
  const DEPLOY = join(process.cwd(), 'scripts/firebase-deploy.sh');

  function runDeploy(
    env: Record<string, string | undefined>,
    args: string[] = ['--only', 'database'],
  ): { status: number; stdout: string; stderr: string } {
    const bin = mkdtempSync(join(tmpdir(), 'wr-fb-npx-'));
    const npxPath = join(bin, 'npx');
    writeFileSync(
      npxPath,
      `#!/usr/bin/env bash
echo "npx-args:$*"
exit 0
`,
    );
    chmodSync(npxPath, 0o755);
    try {
      const stdout = execFileSync('bash', [DEPLOY, ...args], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          ...env,
        },
      });
      return { status: 0, stdout, stderr: '' };
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return {
        status: typeof e.status === 'number' ? e.status : 1,
        stdout: e.stdout ?? '',
        stderr: e.stderr ?? '',
      };
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  }

  it('preserves pre-set EXPO_PUBLIC_FIREBASE_PROJECT_ID (CI wins over .env)', () => {
    const result = runDeploy({ EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'from-ci-env' });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/--project from-ci-env/);
  });

  it('adds --non-interactive when GOOGLE_APPLICATION_CREDENTIALS points at a file', () => {
    const cred = mkdtempSync(join(tmpdir(), 'wr-gac-'));
    const credFile = join(cred, 'sa.json');
    writeFileSync(credFile, '{}');
    try {
      const result = runDeploy({
        EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'from-ci-env',
        GOOGLE_APPLICATION_CREDENTIALS: credFile,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/--non-interactive/);
      expect(result.stdout).toMatch(/Application Default Credentials/);
    } finally {
      rmSync(cred, { recursive: true, force: true });
    }
  });

  it('fails when GOOGLE_APPLICATION_CREDENTIALS path is missing', () => {
    const result = runDeploy({
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'from-ci-env',
      GOOGLE_APPLICATION_CREDENTIALS: '/tmp/wr-missing-sa-does-not-exist.json',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/GOOGLE_APPLICATION_CREDENTIALS.*not found/);
  });
});
