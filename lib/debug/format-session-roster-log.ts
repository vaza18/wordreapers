import type { GameSession } from '../firebase/types.js';

type RosterLogSession = Pick<
  GameSession,
  'players' | 'resultsExitedBy' | 'liveRoundPlayerUids' | 'baseWordPickerUid' | 'baseWordChosenBy'
> &
  Partial<Pick<GameSession, 'baseWord'>>;

function compactUid(uid: string): string {
  if (uid.length <= 6) {
    return uid;
  }
  return uid.slice(-4);
}

/**
 * Compact roster line for Metro multiplayer logs — online/left/live/latch/picker/word flags.
 * Example: `Василь3#a1b2[on,live,latch,w1] Василь7#c3d4[off,w0]`
 */
export function formatSessionRosterLog(
  session: RosterLogSession,
  options?: { liveUidsOverride?: readonly string[] | null },
): string {
  const liveSet = new Set(options?.liveUidsOverride ?? session.liveRoundPlayerUids ?? []);
  const parts: string[] = [];
  for (const [uid, player] of Object.entries(session.players ?? {})) {
    if (!player) {
      continue;
    }
    const flags: string[] = [];
    flags.push(player.online === true ? 'on' : 'off');
    if (player.hasLeft === true) {
      flags.push('left');
    }
    if (liveSet.has(uid)) {
      flags.push('live');
    }
    if (session.resultsExitedBy?.[uid] === true) {
      flags.push('latch');
    }
    if (session.baseWordPickerUid === uid) {
      flags.push('pick');
    }
    if (session.baseWordChosenBy === uid) {
      flags.push('chose');
    }
    flags.push(`w${player.wordCount ?? 0}`);
    const label = (player.name?.trim() || compactUid(uid)).replace(/\s+/g, '');
    parts.push(`${label}#${compactUid(uid)}[${flags.join(',')}]`);
  }
  return parts.join(' ');
}

/** `liveUids=[…] roster=…` fragment for `devLogAction` details. */
export function formatLiveRosterDetails(
  session: RosterLogSession,
  liveUids?: readonly string[] | null,
): string {
  const uids = liveUids ?? session.liveRoundPlayerUids ?? [];
  const roster = formatSessionRosterLog(session, { liveUidsOverride: uids });
  return `liveUids=[${uids.join(',')}] roster=${roster || '∅'}`;
}
