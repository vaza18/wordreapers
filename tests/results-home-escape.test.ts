import { describe, expect, it, vi } from 'vitest';

import {
  createResultsHomePress,
  resultsHomeRequiresExitOnline,
  shouldShowResultsWordsLoadingHomeEscape,
  type ResultsHomeEscapePath,
} from '../lib/online/session/results-home-escape.js';

describe('resultsHomeRequiresExitOnline', () => {
  it('requires exitOnlineToHome for membership escape CTAs (NLD7S)', () => {
    const membership: ResultsHomeEscapePath[] = [
      'maps-retry',
      'rematch-home',
      'words-loading',
      'footer',
    ];
    for (const path of membership) {
      expect(resultsHomeRequiresExitOnline(path)).toBe(true);
    }
  });

  it('allows navigate-only for room-not-found', () => {
    expect(resultsHomeRequiresExitOnline('room-not-found')).toBe(false);
  });
});

describe('shouldShowResultsWordsLoadingHomeEscape', () => {
  it('shows Home on finished/rematch words-loading when viewData is not painted (C1)', () => {
    expect(shouldShowResultsWordsLoadingHomeEscape({ hasFinishedViewData: false })).toBe(true);
    expect(shouldShowResultsWordsLoadingHomeEscape({ hasFinishedViewData: true })).toBe(false);
  });
});

describe('createResultsHomePress', () => {
  it('maps-retry / rematch-home / words-loading call exitOnlineHome, not navigate-only', () => {
    const exitOnlineHome = vi.fn();
    const navigateHomeOnly = vi.fn();

    for (const path of ['maps-retry', 'rematch-home', 'words-loading'] as const) {
      createResultsHomePress({ path, exitOnlineHome, navigateHomeOnly })();
    }

    expect(exitOnlineHome).toHaveBeenCalledTimes(3);
    expect(navigateHomeOnly).not.toHaveBeenCalled();
  });

  it('room-not-found navigates only', () => {
    const exitOnlineHome = vi.fn();
    const navigateHomeOnly = vi.fn();
    createResultsHomePress({
      path: 'room-not-found',
      exitOnlineHome,
      navigateHomeOnly,
    })();
    expect(navigateHomeOnly).toHaveBeenCalledTimes(1);
    expect(exitOnlineHome).not.toHaveBeenCalled();
  });

  it('footer uses exitOnlineHome', () => {
    const exitOnlineHome = vi.fn();
    const navigateHomeOnly = vi.fn();
    createResultsHomePress({ path: 'footer', exitOnlineHome, navigateHomeOnly })();
    expect(exitOnlineHome).toHaveBeenCalledTimes(1);
    expect(navigateHomeOnly).not.toHaveBeenCalled();
  });
});
