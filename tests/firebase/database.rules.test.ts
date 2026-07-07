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

const finishedSession = {
  ...playingSession,
  status: 'finished',
  timerEndsAt: null,
  baseWord: 'книговидавництво',
  baseWordRound: 0,
  baseWordPickerOrder: ['org', 'p1', 'p2'],
  settings: {
    ...playingSession.settings,
    uniqueBonusMode: 'auto',
    uniqueBonusEnabled: true,
  },
  players: {
    org: { name: 'Org', wordCount: 7, score: 11, online: true },
    p1: { name: 'One', wordCount: 4, score: 6, online: true },
    p2: { name: 'Two', wordCount: 5, score: 8, online: true },
  },
  purgeAfterAt: Date.now() + 3_600_000,
  finishedAt: Date.now(),
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
          baseWordPickerUid: 'p2',
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

  it('allows base-word picker nested players blob under current roster write rules', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref('game_sessions/REMCH')
        .set({
          ...waitingSession,
          baseWord: 'слово',
          baseWordPickerOrder: ['org', 'p2'],
          baseWordRound: 1,
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: false },
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
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            p2: { name: 'Two', wordCount: 0, score: 0, online: true },
          },
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
          baseWordPickerUid: 'p2',
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

  it('allows stored baseWordPickerUid to start when round index exceeds picker order length', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref('game_sessions/REMCH')
        .set({
          ...waitingSession,
          baseWord: 'сміховисько',
          baseWordPickerOrder: ['org', 'p1', 'p3'],
          baseWordPickerUid: 'p1',
          baseWordRound: 3,
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            p1: { name: 'One', wordCount: 0, score: 0, online: true },
            p3: { name: 'Three', wordCount: 0, score: 0, online: true },
          },
        });
    });
    const now = Date.now();
    await assertSucceeds(
      authed('p1')
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

  it('allows auto x2 latch settings update during playing when roster reaches 3+', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref('game_sessions/ABCDE')
        .set({
          ...playingSession,
          settings: {
            ...playingSession.settings,
            uniqueBonusMode: 'auto',
            uniqueBonusEnabled: false,
          },
          players: {
            ...playingSession.players,
            joiner: { name: 'Late', wordCount: 0, score: 0, online: true },
          },
        });
    });
    await assertSucceeds(
      authed('joiner')
        .database()
        .ref('game_sessions/ABCDE/settings')
        .update({
          ...playingSession.settings,
          uniqueBonusMode: 'auto',
          uniqueBonusEnabled: true,
        }),
    );
  });

  it('denies turning unique bonus off mid-round', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .database()
        .ref('game_sessions/ABCDE')
        .set({
          ...playingSession,
          settings: {
            ...playingSession.settings,
            uniqueBonusMode: 'auto',
            uniqueBonusEnabled: true,
          },
        });
    });
    await assertFails(
      authed('p1')
        .database()
        .ref('game_sessions/ABCDE/settings')
        .update({
          ...playingSession.settings,
          uniqueBonusMode: 'auto',
          uniqueBonusEnabled: false,
        }),
    );
  });
});

describe('waiting → playing round start player patch', () => {
  const rematchWaiting = {
    ...waitingSession,
    baseWord: 'підкрилля',
    baseWordPickerOrder: ['org', 'p1', 'p3'],
    baseWordPickerUid: 'p1',
    baseWordRound: 1,
    players: {
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      p1: { name: 'One', wordCount: 0, score: 0, online: true },
      p3: { name: 'Three', wordCount: 8, score: 8, online: false },
    },
  };

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('game_sessions/REMCH').set(rematchWaiting);
    });
  });

  it('allows picker multi-path round start with per-player counter reset', async () => {
    const now = Date.now();
    await assertSucceeds(
      authed('p1')
        .database()
        .ref()
        .update({
          'game_sessions/REMCH/status': 'playing',
          'game_sessions/REMCH/timerEndsAt': now + 600_000,
          'game_sessions/REMCH/roundStartedAt': now,
          'game_sessions/REMCH/roundTimerBudgetSeconds': 600,
          'game_sessions/REMCH/roundPlayedSeconds': null,
          'game_sessions/REMCH/earlyFinishVote': null,
          'game_sessions/REMCH/pauseVote': null,
          'game_sessions/REMCH/resumeVote': null,
          'game_sessions/REMCH/pauseState': null,
          'game_sessions/REMCH/players/org/score': 0,
          'game_sessions/REMCH/players/org/wordCount': 0,
          'game_sessions/REMCH/players/org/hasLeft': false,
          'game_sessions/REMCH/players/p1/score': 0,
          'game_sessions/REMCH/players/p1/wordCount': 0,
          'game_sessions/REMCH/players/p1/hasLeft': false,
          'game_sessions/REMCH/players/p3/score': 0,
          'game_sessions/REMCH/players/p3/wordCount': 0,
        }),
    );
  });

  it('allows peer player-node patch under current roster write rules (client uses child paths)', async () => {
    const now = Date.now();
    await assertSucceeds(
      authed('p1')
        .database()
        .ref()
        .update({
          'game_sessions/REMCH/status': 'playing',
          'game_sessions/REMCH/timerEndsAt': now + 600_000,
          'game_sessions/REMCH/roundStartedAt': now,
          'game_sessions/REMCH/players/p3/online': true,
        }),
    );
  });

  it('denies non-picker from transitioning session to playing', async () => {
    const now = Date.now();
    await assertFails(
      authed('org')
        .database()
        .ref('game_sessions/REMCH')
        .update({
          status: 'playing',
          timerEndsAt: now + 600_000,
          roundStartedAt: now,
        }),
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

describe('rematch finished → waiting', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('game_sessions/ABCDE').set(finishedSession);
    });
  });

  it('allows non-organizer roster member to reopen room for rematch', async () => {
    await assertSucceeds(
      authed('p1')
        .database()
        .ref('game_sessions/ABCDE')
        .transaction((current) => {
          if (current == null || current.status !== 'finished') {
            return undefined;
          }
          const players: Record<string, unknown> = {};
          for (const [uid, player] of Object.entries(
            current.players as Record<string, Record<string, unknown>>,
          )) {
            players[uid] = { ...player, score: 0, wordCount: 0, online: true, hasLeft: false };
          }
          return {
            ...current,
            status: 'waiting',
            settings: {
              ...current.settings,
              uniqueBonusEnabled: true,
            },
            timerEndsAt: null,
            roundStartedAt: null,
            roundTimerBudgetSeconds: null,
            roundPlayedSeconds: null,
            baseWord: '',
            baseWordRound: 1,
            players,
            earlyFinishVote: null,
            pauseVote: null,
            pauseState: null,
            resumeVote: null,
            purgeAfterAt: null,
            finishedAt: null,
            resultsExitedBy: null,
            isPublic: false,
            publicPublishedAt: null,
          };
        }),
    );
  });

  it('allows non-organizer atomic rematch with opted-in and peer offline flags', async () => {
    await assertSucceeds(
      authed('p1')
        .database()
        .ref('game_sessions/ABCDE')
        .update({
          status: 'waiting',
          settings: { ...finishedSession.settings, uniqueBonusEnabled: true },
          timerEndsAt: null,
          roundStartedAt: null,
          roundTimerBudgetSeconds: null,
          roundPlayedSeconds: null,
          baseWord: '',
          baseWordRound: 1,
          earlyFinishVote: null,
          pauseVote: null,
          pauseState: null,
          resumeVote: null,
          purgeAfterAt: null,
          finishedAt: null,
          resultsExitedBy: null,
          isPublic: false,
          publicPublishedAt: null,
          players: {
            org: {
              ...finishedSession.players.org,
              score: 0,
              wordCount: 0,
              online: false,
              hasLeft: false,
            },
            p1: {
              ...finishedSession.players.p1,
              score: 0,
              wordCount: 0,
              online: true,
              hasLeft: false,
            },
            p2: {
              ...finishedSession.players.p2,
              score: 0,
              wordCount: 0,
              online: false,
              hasLeft: false,
            },
          },
        }),
    );
  });

  it('allows peer player-node patch after rematch under current roster write rules', async () => {
    await assertSucceeds(
      authed('p1').database().ref('game_sessions/ABCDE/players/org').update({
        score: 0,
        wordCount: 0,
        online: false,
      }),
    );
  });

  it('denies stranger from reopening finished room', async () => {
    await assertFails(
      authed('stranger').database().ref('game_sessions/ABCDE').update({ status: 'waiting' }),
    );
  });
});

describe('bootstrap rematch from archive', () => {
  const bootstrapSession = {
    baseWord: '',
    status: 'waiting',
    organizerId: 'org',
    baseWordPickerUid: 'p1',
    baseWordPickerOrder: ['org', 'p1', 'p2'],
    baseWordRound: 1,
    settings: {
      durationSeconds: 600,
      uniqueBonusEnabled: true,
      uniqueBonusMode: 'auto',
      language: 'uk-uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: null,
    players: {
      org: { name: 'Org', wordCount: 0, score: 0, online: false, hasLeft: true },
      p1: { name: 'One', wordCount: 0, score: 0, online: true },
      p2: { name: 'Two', wordCount: 0, score: 0, online: false },
    },
    earlyFinishVote: null,
    pauseVote: null,
    pauseState: null,
    resumeVote: null,
  };

  it('allows non-organizer to recreate a deleted waiting room from archive', async () => {
    await assertSucceeds(authed('p1').database().ref('game_sessions/BOOT1').set(bootstrapSession));
  });

  it('allows non-organizer to replace an orphan shell with a waiting session', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('game_sessions/BOOT2/players/p1/online').set(false);
    });
    await assertSucceeds(authed('p1').database().ref('game_sessions/BOOT2').set(bootstrapSession));
  });

  it('allows any authed client to read orphan shells for recovery', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('game_sessions/BOOT3/players/p1/online').set(false);
    });
    await assertSucceeds(authed('p1').database().ref('game_sessions/BOOT3').get());
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
