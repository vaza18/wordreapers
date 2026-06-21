/**
 * Builds Android adaptive icon foreground from `assets/icons/app-icon.png`.
 *
 * Foreground: logo only on transparent 1024×1024 (fits ~55% safe zone for launcher zoom).
 * Background color for Android: `ADAPTIVE_BACKGROUND` → `app.json` android.adaptiveIcon.backgroundColor.
 *
 * Run: npm run icons:adaptive
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(root, 'assets', 'icons', 'app-icon.png');
const outputPath = join(root, 'assets', 'icons', 'adaptive-icon-foreground.png');

/** Matches sampled blue from app-icon.png; also used in app.json adaptiveIcon.backgroundColor */
export const ADAPTIVE_BACKGROUND = '#1579f1';

const CANVAS = 1024;
/** Max logo dimension as fraction of canvas (Android 66dp safe zone + launcher zoom). */
const LOGO_MAX_RATIO = 0.55;

const BLUE_REF = { r: 21, g: 121, b: 241 };
const BLUE_TOLERANCE = 48;

function isLogoPixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 128) {
    return false;
  }
  const blueDistance =
    Math.abs(r - BLUE_REF.r) + Math.abs(g - BLUE_REF.g) + Math.abs(b - BLUE_REF.b);
  if (blueDistance <= BLUE_TOLERANCE) {
    return false;
  }
  const isWhite = r > 230 && g > 230 && b > 230;
  const isOrange = r > 200 && g > 80 && g < 180 && b < 120;
  return isWhite || isOrange;
}

function findLogoBounds(
  data: Buffer,
  width: number,
  height: number,
): { left: number; top: number; right: number; bottom: number } | null {
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (isLogoPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  if (right < left || bottom < top) {
    return null;
  }
  return { left, top, right, bottom };
}

function extractLogoRgba(data: Buffer, width: number, height: number): Buffer {
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (isLogoPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) {
        out[i] = data[i];
        out[i + 1] = data[i + 1];
        out[i + 2] = data[i + 2];
        out[i + 3] = 255;
      }
    }
  }
  return out;
}

async function main(): Promise<void> {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bounds = findLogoBounds(data, info.width, info.height);
  if (!bounds) {
    throw new Error('No logo pixels found in app-icon.png');
  }

  const cropWidth = bounds.right - bounds.left + 1;
  const cropHeight = bounds.bottom - bounds.top + 1;
  const logoOnly = extractLogoRgba(data, info.width, info.height);

  const cropped = await sharp(logoOnly, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .extract({
      left: bounds.left,
      top: bounds.top,
      width: cropWidth,
      height: cropHeight,
    })
    .png()
    .toBuffer();

  const maxLogoSize = Math.round(CANVAS * LOGO_MAX_RATIO);
  const scale = Math.min(maxLogoSize / cropWidth, maxLogoSize / cropHeight);
  const targetWidth = Math.round(cropWidth * scale);
  const targetHeight = Math.round(cropHeight * scale);
  const offsetLeft = Math.round((CANVAS - targetWidth) / 2);
  const offsetTop = Math.round((CANVAS - targetHeight) / 2);

  await sharp(cropped)
    .resize(targetWidth, targetHeight, { fit: 'fill' })
    .extend({
      top: offsetTop,
      bottom: CANVAS - targetHeight - offsetTop,
      left: offsetLeft,
      right: CANVAS - targetWidth - offsetLeft,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outputPath);

  console.log(`Wrote assets/icons/adaptive-icon-foreground.png`);
  console.log(
    `  logo crop: ${cropWidth}×${cropHeight} → ${targetWidth}×${targetHeight} on ${CANVAS}×${CANVAS}`,
  );
  console.log(`  margins: left ${offsetLeft}px, top ${offsetTop}px`);
  console.log(`  set android.adaptiveIcon.backgroundColor to ${ADAPTIVE_BACKGROUND}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
