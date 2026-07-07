import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dictionaryGz = join(root, 'assets/generated/dictionaries/uk-uk/dictionary.txt.gz');

if (existsSync(dictionaryGz)) {
  process.exit(0);
}

console.log('ensure-dictionary: building uk-uk dictionary (first install or missing artifacts)…');
const result = spawnSync('npm', ['run', 'dict:all'], { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
