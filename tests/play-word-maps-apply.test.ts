import { describe, expect, it } from 'vitest';

import {
  beginPlayMapsRoundReset,
  commitPlayMapsApply,
  createPlayMapsListenerGate,
  decidePlayMapsForceSync,
  decidePlayMapsForceSyncExhaustion,
  decidePlayMapsListenerApply,
  decidePlayMapsPlayingRichRecovery,
  nextPlayOwnWordsFromMaps,
  nextPlayWordMaps,
  PLAY_MAPS_PLAYING_RICH_RECOVERY_MS,
} from '@/lib/online/session/play-word-maps-apply';

const rich = { wordPlayers: { порт: { org: true }, рот: { peer: true } } };
const empty = { wordPlayers: {} };

describe('nextPlayWordMaps', () => {
  it('rejects empty clears over a non-empty snapshot', () => {
    expect(nextPlayWordMaps(rich, empty)).toBe(rich);
    expect(nextPlayWordMaps(rich, null)).toBe(rich);
  });

  it('allows empty maps after round-local reset to null', () => {
    expect(nextPlayWordMaps(rich, empty)).toBe(rich);
    expect(nextPlayWordMaps(null, empty)).toEqual(empty);
  });
});

describe('decidePlayMapsListenerApply', () => {
  it('ignores stale rich after null reset, then accepts empty', () => {
    const gate = beginPlayMapsRoundReset(createPlayMapsListenerGate());

    const staleRich = decidePlayMapsListenerApply({
      gate,
      callbackEpoch: gate.epoch,
      previous: null,
      next: rich,
      source: 'snapshot',
    });
    expect(staleRich.apply).toBe(false);
    expect(staleRich.gate.awaitingEmptySync).toBe(true);

    const wipe = decidePlayMapsListenerApply({
      gate: staleRich.gate,
      callbackEpoch: staleRich.gate.epoch,
      previous: null,
      next: empty,
      source: 'snapshot',
    });
    expect(wipe.apply).toBe(true);
    expect(wipe.maps).toEqual(empty);
    expect(wipe.gate.awaitingEmptySync).toBe(false);
  });

  it('drops microtasks scheduled before round reset epoch bump', () => {
    let gate = createPlayMapsListenerGate();
    const oldEpoch = gate.epoch;
    gate = beginPlayMapsRoundReset(gate);
    const decided = decidePlayMapsListenerApply({
      gate,
      callbackEpoch: oldEpoch,
      previous: null,
      next: rich,
      source: 'snapshot',
    });
    expect(decided.apply).toBe(false);
  });

  it('does not apply unavailable (permission_denied) as empty clear', () => {
    const decided = decidePlayMapsListenerApply({
      gate: createPlayMapsListenerGate(),
      callbackEpoch: 0,
      previous: rich,
      next: null,
      source: 'unavailable',
    });
    expect(decided.apply).toBe(false);
    expect(decided.maps).toEqual(rich);
  });

  it('rejects mid-play empty over rich without round-reset gate', () => {
    const decided = decidePlayMapsListenerApply({
      gate: createPlayMapsListenerGate(),
      callbackEpoch: 0,
      previous: rich,
      next: empty,
      source: 'snapshot',
    });
    expect(decided.apply).toBe(false);
    expect(decided.maps).toEqual(rich);

    const own = nextPlayOwnWordsFromMaps({
      previousOwn: new Set(['порт']),
      nextMaps: empty,
      myUid: 'org',
      allowEmptyClear: false,
    });
    expect([...own]).toEqual(['порт']);
  });

  it('applies incremental partial-rich snapshots (onChild* fill)', () => {
    const gate = createPlayMapsListenerGate();
    const oneWord = { wordPlayers: { порт: { org: true } } };
    const twoWords = {
      wordPlayers: { порт: { org: true }, ретро: { guest: true } },
    };

    const first = decidePlayMapsListenerApply({
      gate,
      callbackEpoch: 0,
      previous: null,
      next: oneWord,
      source: 'snapshot',
    });
    expect(first.apply).toBe(true);
    expect(first.maps).toEqual(oneWord);

    const second = decidePlayMapsListenerApply({
      gate: first.gate,
      callbackEpoch: first.gate.epoch,
      previous: first.maps,
      next: twoWords,
      source: 'snapshot',
    });
    expect(second.apply).toBe(true);
    expect(second.maps).toEqual(twoWords);
  });

  it('rejects progressive rematch wipe shrinks and keeps full rich mid-play', () => {
    const gate = createPlayMapsListenerGate();
    const one = { wordPlayers: { порт: { org: true } } };

    const progressive = decidePlayMapsListenerApply({
      gate,
      callbackEpoch: 0,
      previous: rich,
      next: one,
      source: 'snapshot',
    });
    expect(progressive.apply).toBe(false);
    expect(progressive.maps).toEqual(rich);

    const wipe = decidePlayMapsListenerApply({
      gate: progressive.gate,
      callbackEpoch: progressive.gate.epoch,
      previous: progressive.maps,
      next: empty,
      source: 'snapshot',
    });
    expect(wipe.apply).toBe(false);
    expect(wipe.maps).toEqual(rich);
  });

  it('under awaitingEmptySync rejects intermediate rich then accepts empty', () => {
    const gate = beginPlayMapsRoundReset(createPlayMapsListenerGate());
    const partialClear = { wordPlayers: { порт: { org: true } } };

    const mid = decidePlayMapsListenerApply({
      gate,
      callbackEpoch: gate.epoch,
      previous: null,
      next: partialClear,
      source: 'snapshot',
    });
    expect(mid.apply).toBe(false);
    expect(mid.gate.awaitingEmptySync).toBe(true);

    const done = decidePlayMapsListenerApply({
      gate: mid.gate,
      callbackEpoch: mid.gate.epoch,
      previous: null,
      next: empty,
      source: 'snapshot',
    });
    expect(done.apply).toBe(true);
    expect(done.maps).toEqual(empty);
    expect(done.gate.awaitingEmptySync).toBe(false);
  });

  it('provisional empty under awaitingEmptySync does not clear wipe latch (C1)', () => {
    const gate = beginPlayMapsRoundReset(createPlayMapsListenerGate());

    const provisionalEmpty = decidePlayMapsListenerApply({
      gate,
      callbackEpoch: gate.epoch,
      previous: null,
      next: empty,
      source: 'snapshot',
      seed: 'provisional',
    });
    expect(provisionalEmpty.apply).toBe(false);
    expect(provisionalEmpty.gate.awaitingEmptySync).toBe(true);

    const staleRich = decidePlayMapsListenerApply({
      gate: provisionalEmpty.gate,
      callbackEpoch: provisionalEmpty.gate.epoch,
      previous: null,
      next: rich,
      source: 'snapshot',
      seed: 'authoritative',
    });
    expect(staleRich.apply).toBe(false);
    expect(staleRich.gate.awaitingEmptySync).toBe(true);

    const wipe = decidePlayMapsListenerApply({
      gate: staleRich.gate,
      callbackEpoch: staleRich.gate.epoch,
      previous: null,
      next: empty,
      source: 'snapshot',
      seed: 'authoritative',
    });
    expect(wipe.apply).toBe(true);
    expect(wipe.maps).toEqual(empty);
    expect(wipe.gate.awaitingEmptySync).toBe(false);
  });

  it('ignores provisional peak so authoritative shrink can apply (play C1 cold mount)', () => {
    const gate = createPlayMapsListenerGate();
    const provisionalRich = {
      wordPlayers: { порт: { org: true }, рот: { peer: true } },
    };
    const authoritativeSmaller = { wordPlayers: { порт: { org: true } } };

    const provisional = decidePlayMapsListenerApply({
      gate,
      callbackEpoch: gate.epoch,
      previous: null,
      next: provisionalRich,
      source: 'snapshot',
      seed: 'provisional',
    });
    expect(provisional.apply).toBe(false);
    expect(provisional.maps).toBeNull();

    const authoritative = decidePlayMapsListenerApply({
      gate: provisional.gate,
      callbackEpoch: provisional.gate.epoch,
      previous: provisional.maps,
      next: authoritativeSmaller,
      source: 'snapshot',
      seed: 'authoritative',
    });
    expect(authoritative.apply).toBe(true);
    expect(authoritative.maps).toEqual(authoritativeSmaller);
  });
});

describe('decidePlayMapsForceSync', () => {
  it('force sync clears awaiting when RTDB is already empty', () => {
    const gate = beginPlayMapsRoundReset(createPlayMapsListenerGate());
    const decided = decidePlayMapsForceSync({
      gate,
      syncEpoch: gate.epoch,
      next: empty,
    });
    expect(decided.apply).toBe(true);
    expect(decided.gate.awaitingEmptySync).toBe(false);
  });

  it('force sync ignores rich while awaiting and keeps the latch', () => {
    const gate = beginPlayMapsRoundReset(createPlayMapsListenerGate());
    const decided = decidePlayMapsForceSync({
      gate,
      syncEpoch: gate.epoch,
      next: rich,
      previous: null,
    });
    expect(decided.apply).toBe(false);
    expect(decided.gate.awaitingEmptySync).toBe(true);
    expect(decided.maps).toBeNull();

    const wipe = decidePlayMapsListenerApply({
      gate: decided.gate,
      callbackEpoch: decided.gate.epoch,
      previous: null,
      next: empty,
      source: 'snapshot',
    });
    expect(wipe.apply).toBe(true);
    expect(wipe.gate.awaitingEmptySync).toBe(false);
  });

  it('rejects rich while awaiting until wipe; before exhaustion still blocks stale rich', () => {
    let gate = beginPlayMapsRoundReset(createPlayMapsListenerGate());
    const firstRich = decidePlayMapsForceSync({
      gate,
      syncEpoch: gate.epoch,
      next: rich,
      previous: null,
    });
    expect(firstRich.apply).toBe(false);
    gate = firstRich.gate;

    const secondRich = decidePlayMapsForceSync({
      gate,
      syncEpoch: gate.epoch,
      next: rich,
      previous: null,
    });
    expect(secondRich.apply).toBe(false);
    expect(secondRich.gate.awaitingEmptySync).toBe(true);

    const wipe = decidePlayMapsListenerApply({
      gate: secondRich.gate,
      callbackEpoch: secondRich.gate.epoch,
      previous: null,
      next: empty,
      source: 'snapshot',
    });
    expect(wipe.apply).toBe(true);
    expect(wipe.gate.awaitingEmptySync).toBe(false);
  });

  it('after exhaustion, rejects stale rich until authoritative empty wipe', () => {
    const gate = beginPlayMapsRoundReset(createPlayMapsListenerGate());
    const exhausted = decidePlayMapsForceSyncExhaustion({
      gate,
      syncEpoch: gate.epoch,
      previous: null,
    });
    expect(exhausted.apply).toBe(true);
    expect(exhausted.maps?.wordPlayers).toEqual({});
    expect(exhausted.gate.awaitingEmptySync).toBe(true);

    const priorRoundRich = { wordPlayers: { старе: { org: true } } };
    const staleRich = decidePlayMapsListenerApply({
      gate: exhausted.gate,
      callbackEpoch: exhausted.gate.epoch,
      previous: exhausted.maps,
      next: priorRoundRich,
      source: 'snapshot',
    });
    expect(staleRich.apply).toBe(false);
    expect(staleRich.gate.awaitingEmptySync).toBe(true);

    const wipe = decidePlayMapsListenerApply({
      gate: staleRich.gate,
      callbackEpoch: staleRich.gate.epoch,
      previous: exhausted.maps,
      next: empty,
      source: 'snapshot',
    });
    expect(wipe.apply).toBe(true);
    expect(wipe.gate.awaitingEmptySync).toBe(false);

    const newRound = { wordPlayers: { нове: { org: true } } };
    const afterWipe = decidePlayMapsListenerApply({
      gate: wipe.gate,
      callbackEpoch: wipe.gate.epoch,
      previous: wipe.maps,
      next: newRound,
      source: 'snapshot',
    });
    expect(afterWipe.apply).toBe(true);
    expect(afterWipe.maps).toEqual(newRound);
  });

  it('after exhaustion, authoritative empty still clears latch', () => {
    const gate = beginPlayMapsRoundReset(createPlayMapsListenerGate());
    const exhausted = decidePlayMapsForceSyncExhaustion({
      gate,
      syncEpoch: gate.epoch,
      previous: null,
    });
    const wipe = decidePlayMapsListenerApply({
      gate: exhausted.gate,
      callbackEpoch: exhausted.gate.epoch,
      previous: exhausted.maps,
      next: empty,
      source: 'snapshot',
    });
    expect(wipe.apply).toBe(true);
    expect(wipe.gate.awaitingEmptySync).toBe(false);
  });

  it('playing rich recovery adopts maps after timer when wipe cannot run', () => {
    const gate = beginPlayMapsRoundReset(createPlayMapsListenerGate());
    const exhausted = decidePlayMapsForceSyncExhaustion({
      gate,
      syncEpoch: gate.epoch,
      previous: null,
    });
    const tooEarly = decidePlayMapsPlayingRichRecovery({
      gate: exhausted.gate,
      syncEpoch: exhausted.gate.epoch,
      next: { wordPlayers: { нове: { org: true } } },
      previous: exhausted.maps,
      liveStatus: 'playing',
      exhaustedForMs: PLAY_MAPS_PLAYING_RICH_RECOVERY_MS - 1,
    });
    expect(tooEarly.apply).toBe(false);
    expect(tooEarly.gate.awaitingEmptySync).toBe(true);

    const whileWaiting = decidePlayMapsPlayingRichRecovery({
      gate: exhausted.gate,
      syncEpoch: exhausted.gate.epoch,
      next: { wordPlayers: { нове: { org: true } } },
      previous: exhausted.maps,
      liveStatus: 'waiting',
      exhaustedForMs: PLAY_MAPS_PLAYING_RICH_RECOVERY_MS,
    });
    expect(whileWaiting.apply).toBe(false);

    const recovered = decidePlayMapsPlayingRichRecovery({
      gate: exhausted.gate,
      syncEpoch: exhausted.gate.epoch,
      next: { wordPlayers: { нове: { org: true } } },
      previous: exhausted.maps,
      liveStatus: 'playing',
      exhaustedForMs: PLAY_MAPS_PLAYING_RICH_RECOVERY_MS,
    });
    expect(recovered.apply).toBe(true);
    expect(recovered.gate.awaitingEmptySync).toBe(false);
    expect(recovered.maps?.wordPlayers).toEqual({ нове: { org: true } });
  });
});

describe('commitPlayMapsApply', () => {
  it('clears maps and own words only when round-reset gate applies empty', () => {
    const gate = beginPlayMapsRoundReset(createPlayMapsListenerGate());
    const decided = decidePlayMapsListenerApply({
      gate,
      callbackEpoch: gate.epoch,
      previous: rich,
      next: empty,
      source: 'snapshot',
    });
    const committed = commitPlayMapsApply({
      decided,
      previousOwn: new Set(['порт', 'рот']),
      myUid: 'org',
      allowEmptyClear: true,
    });
    expect(committed.applied).toBe(true);
    expect(committed.maps).toEqual(empty);
    expect([...committed.ownWords]).toEqual([]);
  });

  it('does not apply mid-play empty over rich', () => {
    const decided = decidePlayMapsListenerApply({
      gate: createPlayMapsListenerGate(),
      callbackEpoch: 0,
      previous: rich,
      next: empty,
      source: 'snapshot',
    });
    const committed = commitPlayMapsApply({
      decided,
      previousOwn: new Set(['порт', 'рот']),
      myUid: 'org',
      allowEmptyClear: false,
    });
    expect(committed.applied).toBe(false);
    expect(committed.maps).toEqual(rich);
    expect([...committed.ownWords]).toEqual(['порт', 'рот']);
  });
});

describe('nextPlayOwnWordsFromMaps', () => {
  it('keeps local words when maps clear to empty without allowEmptyClear', () => {
    const prev = new Set(['порт', 'рот']);
    const next = nextPlayOwnWordsFromMaps({
      previousOwn: prev,
      nextMaps: empty,
      myUid: 'org',
    });
    expect(next).toBe(prev);
  });

  it('clears own words when maps stay non-empty but omit uid', () => {
    const next = nextPlayOwnWordsFromMaps({
      previousOwn: new Set(['порт']),
      nextMaps: { wordPlayers: { рот: { peer: true } } },
      myUid: 'org',
    });
    expect([...next]).toEqual([]);
  });
});
