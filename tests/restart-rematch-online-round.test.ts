import { describe, expect, it } from 'vitest';

import { planRematchAction } from '../lib/online/rematch/plan-rematch-action.js';

describe('planRematchAction', () => {
  it('lets any roster member bootstrap when RTDB was cleaned', () => {
    expect(planRematchAction('missing')).toBe('bootstrap');
  });

  it('joins an already waiting room', () => {
    expect(planRematchAction('waiting')).toBe('join_waiting');
  });

  it('lets any participant restart while session is still finished in RTDB', () => {
    expect(planRematchAction('finished')).toBe('restart_finished');
  });

  it('rejects rematch during an active round', () => {
    expect(planRematchAction('playing')).toBe('join_live');
  });

  it('returns failed for unrecognized RTDB presence', () => {
    expect(planRematchAction('setup' as never)).toBe('failed');
  });
});
