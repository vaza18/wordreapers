import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'wordreapers-rules-test';

let testEnv: RulesTestEnvironment;

function authed(uid: string, signInProvider: 'anonymous' | 'custom' = 'anonymous') {
  return testEnv.authenticatedContext(uid, {
    firebase: { sign_in_provider: signInProvider },
  });
}

function session(gameId: string) {
  return authed('org').database().ref(`game_sessions/${gameId}`);
}

function wordMaps(gameId: string) {
  return authed('p1').database().ref(`session_word_maps/${gameId}`);
}

const waitingSession = {
  baseWord: 'портрет',
  status: 'waiting',
  organizerId: 'org',
  settings: {
    durationSeconds: 600,
    uniqueBonusEnabled: false,
    uniqueBonusMode: 'off',
    language: 'uk-uk',
    allowProperNouns: false,
    allowSlang: false,
  },
  timerEndsAt: null,
  players: {
    org: { name: 'Org', wordCount: 0, score: 0, online: true },
  },
};

const playingSession = {
  ...waitingSession,
  status: 'playing',
  timerEndsAt: Date.now() + 60_000,
  players: {
    org: { name: 'Org', wordCount: 2, score: 10, online: true },
    p1: { name: 'One', wordCount: 1, score: 5, online: true },
  },
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: {
      rules: readFileSync('firebase/database.rules.json', 'utf8'),
      host: '127.0.0.1',
      port: 9000,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearDatabase();
});

describe('game_sessions read', () => {
  it('allows authenticated read on non-existent session (room code probe)', async () => {
    await assertSucceeds(authed('org').database().ref('game_sessions/EMPTY').get());
  });

  it('denies stranger read on playing session', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('game_sessions/ABCDE').set(playingSession);
    });
    await assertFails(authed('stranger').database().ref('game_sessions/ABCDE').get());
  });

  it('allows stranger read on waiting session', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('game_sessions/ABCDE').set(waitingSession);
    });
    await assertSucceeds(authed('stranger').database().ref('game_sessions/ABCDE').get());
  });

  it('allows roster read on finished session', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref('game_sessions/ABCDE')
        .set({ ...playingSession, status: 'finished' });
    });
    await assertSucceeds(authed('p1').database().ref('game_sessions/ABCDE').get());
  });
});

describe('game_sessions write', () => {
  it('allows organizer to create waiting session', async () => {
    await assertSucceeds(session('ABCDE').set(waitingSession));
  });

  it('denies create playing session without organizer auth', async () => {
    await assertFails(
      authed('stranger')
        .database()
        .ref('game_sessions/ABCDE')
        .set({ ...playingSession, organizerId: 'org' }),
    );
  });
});

describe('players write', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('game_sessions/ABCDE').set(playingSession);
    });
  });

  it('allows stranger to join waiting room roster', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('game_sessions/HZ3MR').set(waitingSession);
    });
    await assertSucceeds(
      authed('joiner')
        .database()
        .ref('game_sessions/HZ3MR/players/joiner')
        .set({ name: 'Tablet', wordCount: 0, score: 0, online: true, avatarColorIndex: 1 }),
    );
  });

  it('allows joiner to commit session metadata after roster add', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('game_sessions/HZ3MR').set(waitingSession);
      await ctx
        .database()
        .ref('game_sessions/HZ3MR/players/joiner')
        .set({ name: 'Tablet', wordCount: 0, score: 0, online: true, avatarColorIndex: 1 });
    });
    await assertSucceeds(
      authed('joiner')
        .database()
        .ref('game_sessions/HZ3MR')
        .transaction((current) => {
          if (current == null) {
            return undefined;
          }
          const order = [...(current.baseWordPickerOrder ?? [current.organizerId]), 'joiner'];
          return {
            ...current,
            baseWordPickerOrder: order,
            settings: {
              ...current.settings,
              uniqueBonusEnabled: false,
            },
          };
        }),
    );
  });

  it('allows self presence update', async () => {
    await assertSucceeds(
      authed('p1').database().ref('game_sessions/ABCDE/players/p1').update({ online: false }),
    );
  });

  it('denies stranger overwriting another score directly', async () => {
    await assertFails(
      authed('stranger').database().ref('game_sessions/ABCDE/players/org/score').set(9999),
    );
  });

  it('allows base-word picker to start waiting session while playing', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref('game_sessions/REMCH')
        .set({
          ...waitingSession,
          baseWordPickerOrder: ['org', 'p2'],
          baseWordRound: 1,
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            p2: { name: 'Two', wordCount: 0, score: 0, online: true },
          },
        });
    });
    const now = Date.now();
    await assertSucceeds(
      authed('p2')
        .database()
        .ref('game_sessions/REMCH')
        .update({
          status: 'playing',
          timerEndsAt: now + 60_000,
          roundStartedAt: now,
          roundTimerBudgetSeconds: 600,
          roundPlayedSeconds: null,
        }),
    );
  });

  it('denies non-picker roster member from starting waiting session', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref('game_sessions/REMCH')
        .set({
          ...waitingSession,
          baseWordPickerOrder: ['org', 'p2', 'p3'],
          baseWordRound: 1,
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            p2: { name: 'Two', wordCount: 0, score: 0, online: true },
            p3: { name: 'Three', wordCount: 0, score: 0, online: true },
          },
        });
    });
    await assertFails(
      authed('p3')
        .database()
        .ref('game_sessions/REMCH')
        .update({ status: 'playing', timerEndsAt: Date.now() + 60_000 }),
    );
  });

  it('allows roster member score update within caps', async () => {
    await assertSucceeds(
      authed('p1').database().ref('game_sessions/ABCDE/players/org/score').set(12),
    );
  });

  it('allows stranger to join playing session roster', async () => {
    await assertSucceeds(
      authed('joiner')
        .database()
        .ref('game_sessions/ABCDE/players/joiner')
        .set({ name: 'Late', wordCount: 0, score: 0, online: true, avatarColorIndex: 2 }),
    );
  });

  it('allows joiner to patch picker order after mid-round roster add', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref('game_sessions/ABCDE/players/joiner')
        .set({ name: 'Late', wordCount: 0, score: 0, online: true, avatarColorIndex: 2 });
    });
    await assertSucceeds(
      authed('joiner')
        .database()
        .ref('game_sessions/ABCDE')
        .update({ baseWordPickerOrder: ['org', 'p1', 'joiner'] }),
    );
  });

  it('denies joiner from changing settings mid-round', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref('game_sessions/ABCDE/players/joiner')
        .set({ name: 'Late', wordCount: 0, score: 0, online: true, avatarColorIndex: 2 });
    });
    await assertFails(
      authed('joiner').database().ref('game_sessions/ABCDE/settings/uniqueBonusEnabled').set(true),
    );
  });
});

describe('session_word_maps', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('game_sessions/ABCDE').set(playingSession);
    });
  });

  it('denies forge wordPlayers shard without roster', async () => {
    await assertFails(
      authed('stranger')
        .database()
        .ref('session_word_maps/ABCDE/wordPlayers/slovo/stranger')
        .set(true),
    );
  });

  it('allows roster member to claim word shard', async () => {
    await assertSucceeds(wordMaps('ABCDE').child('wordPlayers/slovo/p1').set(true));
  });

  it('allows roster member wordPlayers leaf transaction while playing', async () => {
    await assertSucceeds(
      authed('p1')
        .database()
        .ref('session_word_maps/ABCDE/wordPlayers/роман/p1')
        .transaction((current) => (current === true ? undefined : true)),
    );
  });

  it('denies wordPlayers parent object write while playing', async () => {
    await assertFails(
      authed('p1').database().ref('session_word_maps/ABCDE/wordPlayers/роман').set({ p1: true }),
    );
  });

  it('denies second writer on wordFirst', async () => {
    await assertSucceeds(wordMaps('ABCDE').child('wordFirst/slovo').set('p1'));
    await assertFails(wordMaps('ABCDE').child('wordFirst/slovo').set('org'));
  });
});

describe('user_stats and public_lobby_counts', () => {
  it('denies anonymous user_stats write', async () => {
    await assertFails(
      authed('u1', 'anonymous')
        .database()
        .ref('user_stats/u1')
        .set({ gamesPlayed: 1, gamesWon: 0, wordsCollected: 0 }),
    );
  });

  it('allows registered user_stats write', async () => {
    await assertSucceeds(
      authed('u1', 'custom')
        .database()
        .ref('user_stats/u1')
        .set({ gamesPlayed: 1, gamesWon: 0, wordsCollected: 0 }),
    );
  });

  it('denies client public_lobby_counts write', async () => {
    await assertFails(authed('u1').database().ref('public_lobby_counts/uk-uk').set(3));
  });
});
