import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VESUM_DIR = path.join(ROOT, '.data', 'vesum');
const MANIFEST_PATH = path.join(VESUM_DIR, 'manifest.json');
const BZ2_PATH = path.join(VESUM_DIR, 'dict_corp_vis.txt.bz2');
const TXT_PATH = path.join(VESUM_DIR, 'dict_corp_vis.txt');
const PINNED_RELEASE_PATH = path.join(ROOT, 'scripts/dictionary/vesum-release.json');

const REPO = 'brown-uk/dict_uk';
const ASSET_NAME = 'dict_corp_vis.txt.bz2';
const FETCH_LATEST = process.argv.includes('--latest') || process.env.VESUM_FETCH_LATEST === '1';

interface GitHubRelease {
  tag_name: string;
  published_at: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}

interface PinnedRelease {
  repo?: string;
  tag: string;
  publishedAt: string;
  assetName?: string;
}

interface VesumManifest {
  tag: string;
  publishedAt: string;
  downloadedAt: string;
  sourceUrl: string;
}

interface ResolvedRelease {
  tag: string;
  publishedAt: string;
  downloadUrl: string;
}

function githubAuthHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'wordreapers-dict-fetch',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function releaseDownloadUrl(repo: string, tag: string, assetName: string): string {
  return `https://github.com/${repo}/releases/download/${tag}/${assetName}`;
}

async function loadPinnedRelease(): Promise<ResolvedRelease> {
  const config = JSON.parse(await readFile(PINNED_RELEASE_PATH, 'utf8')) as PinnedRelease;
  const repo = config.repo ?? REPO;
  const assetName = config.assetName ?? ASSET_NAME;
  return {
    tag: config.tag,
    publishedAt: config.publishedAt,
    downloadUrl: releaseDownloadUrl(repo, config.tag, assetName),
  };
}

async function fetchLatestRelease(): Promise<ResolvedRelease> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: githubAuthHeaders(),
  });
  if (!res.ok) {
    const hint =
      res.status === 403
        ? ' (GitHub API rate limit — use pinned release or set GITHUB_TOKEN for --latest)'
        : '';
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}${hint}`);
  }

  const release = (await res.json()) as GitHubRelease;
  const asset = release.assets.find((a) => a.name === ASSET_NAME);
  if (!asset) {
    throw new Error(`Asset ${ASSET_NAME} not found in release ${release.tag_name}`);
  }

  return {
    tag: release.tag_name,
    publishedAt: release.published_at,
    downloadUrl: asset.browser_download_url,
  };
}

async function resolveRelease(): Promise<ResolvedRelease> {
  if (FETCH_LATEST) {
    console.log('Fetching latest VESUM release from GitHub API…');
    return fetchLatestRelease();
  }

  console.log('Using pinned VESUM release (scripts/dictionary/vesum-release.json)…');
  return loadPinnedRelease();
}

async function loadManifest(): Promise<VesumManifest | null> {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as VesumManifest;
  } catch {
    return null;
  }
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: ${res.status} ${url}`);
  }

  await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(dest));
}

async function decompressBz2(src: string, dest: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('bunzip2', ['-kf', src], { stdio: 'inherit' });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`bunzip2 exited with code ${code}`));
      }
    });
  });

  // bunzip2 -k keeps .bz2 and writes dict_corp_vis.txt next to it
  const decompressed = src.replace(/\.bz2$/, '');
  if (decompressed !== dest && decompressed !== TXT_PATH) {
    await import('node:fs/promises').then(({ rename }) => rename(decompressed, dest));
  }
}

async function main(): Promise<void> {
  await mkdir(VESUM_DIR, { recursive: true });

  const release = await resolveRelease();
  const existing = await loadManifest();
  const txtExists = await readFile(TXT_PATH, 'utf8')
    .then(() => true)
    .catch(() => false);

  if (existing?.tag === release.tag && txtExists) {
    console.log(`VESUM ${release.tag} already present at ${TXT_PATH}`);
    return;
  }

  console.log(`Downloading VESUM ${release.tag}…`);
  console.log(release.downloadUrl);

  await downloadFile(release.downloadUrl, BZ2_PATH);
  console.log('Decompressing…');
  await decompressBz2(BZ2_PATH, TXT_PATH);

  const manifest: VesumManifest = {
    tag: release.tag,
    publishedAt: release.publishedAt,
    downloadedAt: new Date().toISOString(),
    sourceUrl: release.downloadUrl,
  };
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`Done. Manifest: ${MANIFEST_PATH}`);
  console.log(`Dictionary: ${TXT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
