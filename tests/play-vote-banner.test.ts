import { describe, expect, it } from 'vitest';

import { shouldShowInvitePlayVoteBanner } from '@/lib/online/play-vote-banner';

describe('shouldShowInvitePlayVoteBanner', () => {
  it('shows while the viewer still needs to vote', () => {
    expect(shouldShowInvitePlayVoteBanner('a', 'b', true)).toBe(true);
  });

  it('shows for the proposer while the vote is open', () => {
    expect(shouldShowInvitePlayVoteBanner('a', 'a', false)).toBe(true);
  });

  it('hides after the viewer already voted', () => {
    expect(shouldShowInvitePlayVoteBanner('a', 'b', false)).toBe(false);
  });
});
