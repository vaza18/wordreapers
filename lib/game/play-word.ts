import { toDisplayUpper } from '../dictionary/normalize.js';
import {
  validateWord,
  type ValidateWordDeps,
  type ValidateWordOptions,
  type ValidationErrorCode,
} from '../dictionary/validate-word.js';

import { toScoredWordEntry, type ScoredWordEntry } from './scoring.js';

/** Validation failure or duplicate submission when accepting a word. */
export type PlayWordErrorCode = ValidationErrorCode | 'ALREADY_SUBMITTED';

/** Outcome of attempting to accept a composed word during a round. */
export interface PlayWordResult {
  accepted: boolean;
  normalized: string;
  display?: string;
  entry?: ScoredWordEntry;
  error?: PlayWordErrorCode;
}

/** Inputs required to validate and score a composed word. */
export interface PlayWordContext {
  input: string;
  baseWord: string;
  playerId: string;
  uniqueBonusEnabled: boolean;
  playerWords: ReadonlyMap<string, readonly string[]>;
  deps: ValidateWordDeps;
  options?: ValidateWordOptions;
  lookupDisplayUpper: (normalized: string) => string | null;
}

/**
 * Validate, deduplicate, and score a composed word.
 */
export function acceptWord(ctx: PlayWordContext): PlayWordResult {
  const validation = validateWord(ctx.input, ctx.baseWord, ctx.deps, ctx.options);
  const normalized = validation.normalized;

  if (!validation.valid) {
    return { accepted: false, normalized, error: validation.error };
  }

  const existing = ctx.playerWords.get(ctx.playerId) ?? [];
  if (existing.includes(normalized)) {
    return { accepted: false, normalized, error: 'ALREADY_SUBMITTED' };
  }

  const display = ctx.lookupDisplayUpper(normalized) ?? toDisplayUpper(normalized);

  let globalCount = 0;
  for (const words of ctx.playerWords.values()) {
    if (words.includes(normalized)) {
      globalCount += 1;
    }
  }
  globalCount += 1;

  const kind = globalCount > 1 ? 'normal' : 'unique';
  return {
    accepted: true,
    normalized,
    display,
    entry: toScoredWordEntry(normalized, kind, ctx.uniqueBonusEnabled, globalCount),
  };
}
