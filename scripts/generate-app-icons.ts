/**
 * Generates SVG-based icon mockups (legacy grid/tile concept) → docs/store/icon-mockups/.
 *
 * Production icon: `assets/icons/app-icon.png` (see `app.json`).
 *
 * Run: npm run icons:generate
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { lightColors } from '../constants/theme.js';
import { LETTER_KEY_FONT_WEIGHT } from '../constants/letter-keyboard.js';
import {
  letterKeyProportions,
  tileInsetForCell,
  tileSizeForCell,
} from '../lib/game/letter-key-style.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mockupsDir = join(root, 'docs', 'store', 'icon-mockups');

/** Warm paper + typical Ukrainian school notebook grid (light blue lines). */
const PAPER = lightColors.backgroundSecondary;
const GRID_LINE = '#A8C4E0';

const PEN_BLUE = lightColors.penBlue;
const ACCENT = lightColors.accent;
/** Available key label on penBlue (`LetterKeyboard.keyLabelAvailable`). */
const TEXT_ON_HIGH = lightColors.penBlueMuted;
const TEXT_ON_LOW = PEN_BLUE;

/** Gameplay ratios at reference phone width (see `letter-key-style.ts`). */
// TODO: drop duplicate theme values once `LetterKeyboard` imports letter-key-style directly
const KEY_PROPS = letterKeyProportions();

const FULL_COLS = 4;
const TILE_ROWS = 3;
const TILE_COLS = 4;

/** iOS-style squircle clip (~22% of side); no visible border — clip only. */
const CORNER_RADIUS_RATIO = 0.22;

type IconLocale = 'en' | 'uk';

interface LocaleSpec {
  /** Row-major tile letters for rows 0–2; `null` = empty cell */
  tiles: (string | null)[];
  /** First N tiles use high-contrast penBlue (СЛОВО / WORD) */
  highlightCount: number;
  tagline: string;
}

const LOCALES: Record<IconLocale, LocaleSpec> = {
  en: {
    tiles: ['W', 'O', 'R', 'D', 'R', 'E', 'A', 'P', 'E', 'R', 'S', null],
    highlightCount: 4,
    tagline: 'WORD',
  },
  uk: {
    tiles: ['С', 'Л', 'О', 'В', 'О', 'З', 'Б', 'И', 'Р', 'А', 'Ч', 'І'],
    highlightCount: 5,
    tagline: 'СЛОВО',
  },
};

interface LayoutOptions {
  /** Fraction of one cell visible as a partial strip on each edge (larger → smaller tiles) */
  edgePartial: number;
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function tileInset(cellSize: number): number {
  return Math.round(tileInsetForCell(cellSize, KEY_PROPS));
}

function layoutGeometry(size: number, edgePartial: number) {
  const cellSize = size / (FULL_COLS + 2 * edgePartial);
  const blockX = edgePartial * cellSize;
  const blockY = edgePartial * cellSize;
  const cornerRadius = Math.round(size * CORNER_RADIUS_RATIO);
  return { cellSize, blockX, blockY, cornerRadius };
}

/** Grid lines across the entire icon; cells align with the centred 4×4 block */
function buildFullCanvasGrid(
  blockX: number,
  blockY: number,
  cellSize: number,
  size: number,
  lineWidth: number,
): string {
  const lines: string[] = [];

  const colStart = Math.floor(-blockX / cellSize) - 1;
  const colEnd = Math.ceil((size - blockX) / cellSize) + 1;
  for (let column = colStart; column <= colEnd; column += 1) {
    const x = blockX + column * cellSize;
    lines.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${size}" stroke="${GRID_LINE}" stroke-width="${lineWidth}"/>`,
    );
  }

  const rowStart = Math.floor(-blockY / cellSize) - 1;
  const rowEnd = Math.ceil((size - blockY) / cellSize) + 1;
  for (let row = rowStart; row <= rowEnd; row += 1) {
    const y = blockY + row * cellSize;
    lines.push(
      `<line x1="0" y1="${y}" x2="${size}" y2="${y}" stroke="${GRID_LINE}" stroke-width="${lineWidth}"/>`,
    );
  }

  return lines.join('\n  ');
}

function buildTile(
  letter: string,
  col: number,
  row: number,
  blockX: number,
  blockY: number,
  cellSize: number,
  highlighted: boolean,
  fontSize: number,
  radius: number,
  inset: number,
  strokeWidth: number,
): string {
  const x = blockX + col * cellSize + inset;
  const y = blockY + row * cellSize + inset;
  const side = cellSize - inset * 2;
  const cx = x + side / 2;
  const cy = y + side / 2;
  const fill = highlighted ? PEN_BLUE : lightColors.backgroundPrimary;
  const textFill = highlighted ? TEXT_ON_HIGH : TEXT_ON_LOW;
  const stroke = highlighted ? '' : ` stroke="${PEN_BLUE}" stroke-width="${strokeWidth}"`;

  return `
  <rect x="${x}" y="${y}" width="${side}" height="${side}" rx="${radius}" fill="${fill}"${stroke}/>
  <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
        font-weight="${LETTER_KEY_FONT_WEIGHT}" font-size="${fontSize}" fill="${textFill}">${escapeXml(letter)}</text>`;
}

function buildTagline(
  text: string,
  blockX: number,
  blockY: number,
  cellSize: number,
  fontSize: number,
): string {
  const cx = blockX + (FULL_COLS * cellSize) / 2;
  const cy = blockY + TILE_ROWS * cellSize + cellSize * 0.56;

  return `
  <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
        font-weight="700" font-size="${fontSize}" fill="${ACCENT}">${escapeXml(text)}</text>`;
}

function buildIconSvg(size: number, locale: IconLocale, options: LayoutOptions): string {
  const spec = LOCALES[locale];
  const { cellSize, blockX, blockY, cornerRadius } = layoutGeometry(size, options.edgePartial);
  const lineWidth = Math.max(1, Math.round(size * 0.002));
  const inset = tileInset(cellSize);
  const tileSide = tileSizeForCell(cellSize, inset);
  const tileRadius = Math.round(tileSide * KEY_PROPS.borderRadiusRatio);
  const tileFontSize = Math.round(tileSide * KEY_PROPS.fontSizeRatio);
  /** ~1 px outline at reference key size, scaled with tile */
  const tileStrokeWidth = Math.max(1, Math.round(tileSide / KEY_PROPS.keySize));
  const taglineFontSize = Math.round(cellSize * 0.6);

  const tiles: string[] = [];
  for (let index = 0; index < spec.tiles.length; index += 1) {
    const letter = spec.tiles[index];
    if (letter === null) {
      continue;
    }
    const col = index % TILE_COLS;
    const row = Math.floor(index / TILE_COLS);
    tiles.push(
      buildTile(
        letter,
        col,
        row,
        blockX,
        blockY,
        cellSize,
        index < spec.highlightCount,
        tileFontSize,
        tileRadius,
        inset,
        tileStrokeWidth,
      ),
    );
  }

  return `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="iconClip">
      <rect width="${size}" height="${size}" rx="${cornerRadius}" ry="${cornerRadius}"/>
    </clipPath>
  </defs>
  <g clip-path="url(#iconClip)">
    <rect width="${size}" height="${size}" fill="${PAPER}"/>
    ${buildFullCanvasGrid(blockX, blockY, cellSize, size, lineWidth)}
    ${tiles.join('')}
    ${buildTagline(spec.tagline, blockX, blockY, cellSize, taglineFontSize)}
  </g>
</svg>`;
}

async function renderIcon(
  size: number,
  locale: IconLocale,
  options: LayoutOptions,
): Promise<Buffer> {
  const svg = buildIconSvg(size, locale, options);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Default edge inset: 16 full cells centred, partial strips at icon edges */
const DEFAULT_EDGE_PARTIAL = 0.38;

interface OutputFile {
  name: string;
  locale: IconLocale;
  edgePartial: number;
}

const OUTPUTS: OutputFile[] = [
  {
    name: 'mockup-en-tight.png',
    locale: 'en',
    edgePartial: 0.32,
  },
  {
    name: 'mockup-en-balanced.png',
    locale: 'en',
    edgePartial: DEFAULT_EDGE_PARTIAL,
  },
  {
    name: 'mockup-en-loose.png',
    locale: 'en',
    edgePartial: 0.46,
  },
  {
    name: 'mockup-uk-balanced.png',
    locale: 'uk',
    edgePartial: DEFAULT_EDGE_PARTIAL,
  },
  {
    name: 'mockup-uk-tight.png',
    locale: 'uk',
    edgePartial: 0.32,
  },
];

async function main(): Promise<void> {
  mkdirSync(mockupsDir, { recursive: true });

  const written: string[] = [];
  for (const output of OUTPUTS) {
    const buffer = await renderIcon(1024, output.locale, { edgePartial: output.edgePartial });
    writeFileSync(join(mockupsDir, output.name), buffer);
    written.push(`docs/store/icon-mockups/${output.name}`);
  }

  console.log(`Wrote ${written.length} icons:\n${written.map((path) => `  ${path}`).join('\n')}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
