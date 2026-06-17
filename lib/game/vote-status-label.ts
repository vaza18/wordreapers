import { tGendered, type PlayerGender } from './grammar.js';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/** Vote choice shown in pause / early-finish modals. */
export type VoteStatusLabel = 'yes' | 'no' | 'pending' | 'not_required';

/** Map session player gender to grammar helper input. */
export function playerGenderFromSession(gender: 'm' | 'f' | null | undefined): PlayerGender {
  return gender === 'f' || gender === 'm' ? gender : null;
}

/** Localized label when a player leaves mid-round. */
export function formatPlayerLeftLabel(t: TranslateFn, playerGender: PlayerGender): string {
  return tGendered(t, 'game.playerLeft', playerGender);
}

/** Localized vote status for one participant row. */
export function formatVoteStatusLabel(
  t: TranslateFn,
  status: VoteStatusLabel,
  hasLeft: boolean,
  playerGender: PlayerGender,
): string {
  if (hasLeft) {
    return tGendered(t, 'game.voteStatusLeft', playerGender);
  }
  switch (status) {
    case 'yes':
      return tGendered(t, 'game.voteStatusYes', playerGender);
    case 'no':
      return tGendered(t, 'game.voteStatusNo', playerGender);
    case 'pending':
      return t('game.voteStatusPending');
    default:
      return t('game.voteStatusNotRequired');
  }
}
