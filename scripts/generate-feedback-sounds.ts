import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GENERATED_SOUNDS_DIR } from '../lib/assets/generated-paths.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, GENERATED_SOUNDS_DIR);

function writeWav(path: string, frequencyHz: number, durationMs: number, volume = 0.25): void {
  const sampleRate = 22_050;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const data = Buffer.alloc(numSamples * 2);

  for (let index = 0; index < numSamples; index += 1) {
    const time = index / sampleRate;
    const attack = Math.min(1, index / (sampleRate * 0.008));
    const release = Math.min(1, (numSamples - index) / (sampleRate * 0.06));
    const envelope = attack * release;
    const sample = Math.sin(2 * Math.PI * frequencyHz * time) * envelope * volume;
    const clamped = Math.max(-32_767, Math.min(32_767, Math.floor(sample * 32_767)));
    data.writeInt16LE(clamped, index * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);

  writeFileSync(path, Buffer.concat([header, data]));
}

mkdirSync(outDir, { recursive: true });
writeWav(join(outDir, 'key-press.wav'), 1_400, 40);
writeWav(join(outDir, 'word-accepted.wav'), 660, 160, 0.35);
console.log(`Wrote feedback sounds to ${GENERATED_SOUNDS_DIR}/`);
