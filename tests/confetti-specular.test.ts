import { describe, expect, it } from 'vitest';

import {
  buildSpecularOpacityKeyframes,
  DEFAULT_SPECULAR_DESCENT_START,
  placeSpecularFlashCenters,
  SPECULAR_FLASH_HALF_WIDTH,
  SPECULAR_FLASH_OPACITY,
} from '../lib/visual/confetti-specular.js';

describe('placeSpecularFlashCenters', () => {
  it('keeps centers inside the requested band', () => {
    const centers = placeSpecularFlashCenters(4, 0.2, 0.9, 0.1);
    expect(centers).toHaveLength(4);
    for (const c of centers) {
      expect(c).toBeGreaterThanOrEqual(0.2);
      expect(c).toBeLessThanOrEqual(0.9);
    }
  });
});

describe('buildSpecularOpacityKeyframes', () => {
  it('returns strictly monotonic inputRange of equal length to outputRange', () => {
    const { inputRange, outputRange } = buildSpecularOpacityKeyframes({
      flashCount: 8,
      phase: 0.31,
    });
    expect(inputRange).toHaveLength(outputRange.length);
    expect(inputRange[0]).toBe(0);
    expect(inputRange[inputRange.length - 1]).toBe(1);
    for (let i = 1; i < inputRange.length; i += 1) {
      expect(inputRange[i]!).toBeGreaterThan(inputRange[i - 1]!);
    }
  });

  it('uses only fully-off or fully-opaque white (no translucent wash peaks)', () => {
    const { outputRange } = buildSpecularOpacityKeyframes({
      flashCount: 10,
      phase: 0.12,
    });
    for (const value of outputRange) {
      expect(value === 0 || value === SPECULAR_FLASH_OPACITY).toBe(true);
    }
    expect(outputRange[0]).toBe(0);
    expect(outputRange[outputRange.length - 1]).toBe(0);
  });

  it('packs more opaque glints after descentStart than before', () => {
    const descentStart = DEFAULT_SPECULAR_DESCENT_START;
    const { inputRange, outputRange } = buildSpecularOpacityKeyframes({
      flashCount: 12,
      phase: 0,
      descentStart,
    });

    let earlyPeaks = 0;
    let latePeaks = 0;
    for (let i = 0; i < inputRange.length; i += 1) {
      if (outputRange[i] !== SPECULAR_FLASH_OPACITY) {
        continue;
      }
      // Count each plateau once (first sample of a run).
      if (i > 0 && outputRange[i - 1] === SPECULAR_FLASH_OPACITY) {
        continue;
      }
      if (inputRange[i]! < descentStart) {
        earlyPeaks += 1;
      } else {
        latePeaks += 1;
      }
    }

    expect(earlyPeaks).toBeGreaterThan(0);
    expect(latePeaks).toBeGreaterThan(earlyPeaks);
  });

  it('keeps each glint brief', () => {
    const { inputRange, outputRange } = buildSpecularOpacityKeyframes({
      flashCount: 8,
      phase: 0.2,
    });
    for (let i = 0; i < inputRange.length; i += 1) {
      if (outputRange[i] !== 0 || i === 0) {
        continue;
      }
      // Valley after a flash: previous non-zero run width should be small.
      let start = i - 1;
      while (start > 0 && outputRange[start]! > 0) {
        start -= 1;
      }
      if (outputRange[start] === 0) {
        start += 1;
      }
      if (start >= i) {
        continue;
      }
      const width = inputRange[i]! - inputRange[start]!;
      expect(width).toBeLessThanOrEqual(SPECULAR_FLASH_HALF_WIDTH * 2 + 1e-3);
    }
  });

  it('is deterministic for the same inputs', () => {
    const a = buildSpecularOpacityKeyframes({ flashCount: 6, phase: 0.42 });
    const b = buildSpecularOpacityKeyframes({ flashCount: 6, phase: 0.42 });
    expect(a).toEqual(b);
  });

  it('shifts peak positions when phase changes', () => {
    const a = buildSpecularOpacityKeyframes({ flashCount: 6, phase: 0 });
    const b = buildSpecularOpacityKeyframes({ flashCount: 6, phase: 0.17 });
    expect(a.inputRange).not.toEqual(b.inputRange);
  });
});
