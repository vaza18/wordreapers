import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** npm 11 may install a phantom react-native@0.86 peer under react-native@0.81; Metro must not bundle it. */
const nested = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'node_modules',
  'react-native',
  'node_modules',
  'react-native',
);

if (existsSync(nested)) {
  rmSync(nested, { recursive: true, force: true });
  console.log('prune-nested-react-native: removed nested react-native (npm peer-dep artifact)');
}
