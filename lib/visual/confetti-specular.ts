/** Progress where confetti trajectory sway / specular intensification begins. */
export const DEFAULT_SPECULAR_DESCENT_START = 0.18;

/** Fully opaque white cover during a glint (never a translucent wash). */
export const SPECULAR_FLASH_OPACITY = 1;

/**
 * Half-width of each glint in progress units (~0.01 ≈ 50ms at a 5s flight).
 * Kept tiny so the piece snaps to white and back instead of fading.
 */
export const SPECULAR_FLASH_HALF_WIDTH = 0.01;

/** Opacity interpolate ranges for a particle specular overlay. */
export type SpecularOpacityKeyframes = {
  inputRange: number[];
  outputRange: number[];
};

/** Options for {@link buildSpecularOpacityKeyframes}. */
export type BuildSpecularOpacityKeyframesOptions = {
  flashCount: number;
  /** Phase offset in [0, 1); shifts peak centers without using Math.random. */
  phase: number;
  /** Progress where descent intensification begins (matches trajectory sway). */
  descentStart?: number;
};

function wrap01(value: number): number {
  return ((value % 1) + 1) % 1;
}

function lastNumber(values: number[]): number {
  return values[values.length - 1] ?? 0;
}

/**
 * Place `count` flash centers evenly in [start, end], shifted by `phase`.
 * Centers stay inset so a brief opaque plateau fits inside the band.
 */
export function placeSpecularFlashCenters(
  count: number,
  start: number,
  end: number,
  phase: number,
  halfWidth: number = SPECULAR_FLASH_HALF_WIDTH,
): number[] {
  if (count <= 0 || end <= start) {
    return [];
  }
  const inset = halfWidth * 2;
  const lo = start + inset;
  const hi = end - inset;
  if (hi <= lo) {
    return [(start + end) / 2];
  }
  const span = hi - lo;
  const centers: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const u = wrap01((i + 0.5) / count + phase);
    centers.push(lo + span * u);
  }
  centers.sort((a, b) => a - b);
  return centers;
}

/**
 * Precomputed opacity keyframes for brief opaque white glints.
 * Intensifies on descent by packing more flashes after `descentStart`,
 * not by raising mid-range opacity (which reads as fading / transparency).
 */
export function buildSpecularOpacityKeyframes(
  opts: BuildSpecularOpacityKeyframesOptions,
): SpecularOpacityKeyframes {
  const descentStart = opts.descentStart ?? DEFAULT_SPECULAR_DESCENT_START;
  const flashCount = Math.max(2, Math.floor(opts.flashCount));
  const phase = wrap01(opts.phase);
  const halfWidth = SPECULAR_FLASH_HALF_WIDTH;
  /** Snap ramp — almost all of the glint duration stays at full white. */
  const ramp = Math.min(0.0015, halfWidth * 0.2);

  // ~1/4 of glints on the rise, ~3/4 while falling (more sparkle on descent).
  const earlyCount = Math.max(1, Math.round(flashCount * 0.25));
  const lateCount = Math.max(earlyCount + 1, flashCount - earlyCount);

  const centers = [
    ...placeSpecularFlashCenters(earlyCount, 0, descentStart, phase, halfWidth),
    ...placeSpecularFlashCenters(lateCount, descentStart, 1, wrap01(phase + 0.37), halfWidth),
  ];
  centers.sort((a, b) => a - b);

  const inputRange: number[] = [0];
  const outputRange: number[] = [0];

  const pushKeyframe = (t: number, opacity: number) => {
    const last = lastNumber(inputRange);
    if (t <= last) {
      const nudged = Math.min(1, last + 1e-4);
      if (nudged <= last) {
        return;
      }
      inputRange.push(nudged);
      outputRange.push(opacity);
      return;
    }
    inputRange.push(t);
    outputRange.push(opacity);
  };

  for (const center of centers) {
    const left = Math.max(0, center - halfWidth);
    const right = Math.min(1, center + halfWidth);
    const plateauStart = Math.min(center, left + ramp);
    const plateauEnd = Math.max(center, right - ramp);
    pushKeyframe(left, 0);
    pushKeyframe(plateauStart, SPECULAR_FLASH_OPACITY);
    pushKeyframe(plateauEnd, SPECULAR_FLASH_OPACITY);
    pushKeyframe(right, 0);
  }

  if (lastNumber(inputRange) < 1) {
    pushKeyframe(1, 0);
  } else if (outputRange.length > 0) {
    outputRange[outputRange.length - 1] = 0;
  }

  return { inputRange, outputRange };
}
