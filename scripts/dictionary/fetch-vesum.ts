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

const REPO = 'brown-uk/dict_uk';
const ASSET_NAME = 'dict_corp_vis.txt.bz2';

interface GitHubRelease {
  tag_name: string;
  published_at: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}

interface VesumManifest {
  tag: string;
  publishedAt: string;
  downloadedAt: string;
  sourceUrl: string;
}

async function fetchLatestRelease(): Promise<GitHubRelease> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'wordreapers-dict-fetch' },
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as GitHubRelease;
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

  const release = await fetchLatestRelease();
  const asset = release.assets.find((a) => a.name === ASSET_NAME);
  if (!asset) {
    throw new Error(`Asset ${ASSET_NAME} not found in release ${release.tag_name}`);
  }

  const existing = await loadManifest();
  const txtExists = await readFile(TXT_PATH, 'utf8')
    .then(() => true)
    .catch(() => false);

  if (existing?.tag === release.tag_name && txtExists) {
    console.log(`VESUM ${release.tag_name} already present at ${TXT_PATH}`);
    return;
  }

  console.log(`Downloading VESUM ${release.tag_name}…`);
  console.log(asset.browser_download_url);

  await downloadFile(asset.browser_download_url, BZ2_PATH);
  console.log('Decompressing…');
  await decompressBz2(BZ2_PATH, TXT_PATH);

  const manifest: VesumManifest = {
    tag: release.tag_name,
    publishedAt: release.published_at,
    downloadedAt: new Date().toISOString(),
    sourceUrl: asset.browser_download_url,
  };
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`Done. Manifest: ${MANIFEST_PATH}`);
  console.log(`Dictionary: ${TXT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
