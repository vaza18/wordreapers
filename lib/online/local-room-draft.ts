import type { UniqueBonusMode } from '../game/scoring.js';
import type { PlayerProfile } from '../profile/player-profile.js';

export interface LocalRoomSetup {
  baseWord: string;
  baseWordDisplay: string;
  durationMinutes: number;
  uniqueBonusMode: UniqueBonusMode;
  allowProperNouns: boolean;
  allowSlang: boolean;
}

export interface LocalRoomDraft {
  draftId: string;
  preferredCode: string;
  profile: PlayerProfile;
  setup: LocalRoomSetup | null;
  /** Set after first Firebase publish; may differ from `preferredCode`. */
  publishedGameId: string | null;
}

const drafts = new Map<string, LocalRoomDraft>();

export function createLocalRoomDraft(
  preferredCode: string,
  profile: PlayerProfile,
): LocalRoomDraft {
  const draft: LocalRoomDraft = {
    draftId: preferredCode,
    preferredCode,
    profile,
    setup: null,
    publishedGameId: null,
  };
  drafts.set(preferredCode, draft);
  return draft;
}

export function getLocalRoomDraft(draftId: string): LocalRoomDraft | null {
  return drafts.get(draftId) ?? null;
}

export function updateLocalRoomDraft(
  draftId: string,
  patch: Partial<Pick<LocalRoomDraft, 'setup' | 'publishedGameId'>>,
): LocalRoomDraft | null {
  const draft = drafts.get(draftId);
  if (!draft) {
    return null;
  }
  const next = { ...draft, ...patch };
  drafts.set(draftId, next);
  return next;
}

export function setLocalRoomPublishedGameId(draftId: string, publishedGameId: string): void {
  const draft = drafts.get(draftId);
  if (!draft) {
    return;
  }
  drafts.set(draftId, { ...draft, publishedGameId });
}

export function removeLocalRoomDraft(draftId: string): void {
  drafts.delete(draftId);
}

export function resolveDraftGameId(draft: LocalRoomDraft): string {
  return draft.publishedGameId ?? draft.preferredCode;
}
