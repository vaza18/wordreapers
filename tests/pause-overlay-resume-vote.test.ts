import { describe, expect, it } from 'vitest';

import { resolvePauseOverlayResumeVote } from '../lib/online/voting/pause-overlay-resume-vote.js';
import type { SessionVote } from '../lib/firebase/types.js';

const vote = (proposedBy: string): SessionVote => ({
  proposedBy,
  proposedAt: 1_000,
  votes: { [proposedBy]: 'yes' },
});

describe('resolvePauseOverlayResumeVote', () => {
  it('prefers session resumeVote over a stale null prop', () => {
    expect(resolvePauseOverlayResumeVote(vote('a'), null)).toEqual(vote('a'));
  });

  it('falls back to prop when session field is missing', () => {
    expect(resolvePauseOverlayResumeVote(undefined, vote('b'))).toEqual(vote('b'));
  });

  it('returns null when neither source has a vote', () => {
    expect(resolvePauseOverlayResumeVote(null, undefined)).toBeNull();
  });
});
