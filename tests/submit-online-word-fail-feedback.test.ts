import { describe, expect, it } from 'vitest';

import { feedbackForFailedOnlineSubmit } from '../lib/online/submit-online-word-fail-feedback.js';

describe('feedbackForFailedOnlineSubmit', () => {
  const t = (key: string) => key;

  it('maps DUPLICATE to already-submitted copy', () => {
    expect(feedbackForFailedOnlineSubmit(t, 'DUPLICATE')).toEqual({
      message: 'game.errorAlreadySubmitted',
      variant: 'default',
    });
  });

  it('clears success tone for NOT_PLAYING and SESSION_MISSING', () => {
    expect(feedbackForFailedOnlineSubmit(t, 'NOT_PLAYING')).toEqual({
      message: 'game.errorUnknown',
      variant: 'default',
    });
    expect(feedbackForFailedOnlineSubmit(t, 'SESSION_MISSING')).toEqual({
      message: 'game.errorUnknown',
      variant: 'default',
    });
  });

  it('maps NETWORK to firebase network copy', () => {
    expect(feedbackForFailedOnlineSubmit(t, 'NETWORK')).toEqual({
      message: 'online.errorFirebaseNetwork',
      variant: 'default',
    });
  });
});
