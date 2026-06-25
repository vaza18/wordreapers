import { beforeEach, describe, expect, it, vi } from 'vitest';

const signOutMock = vi.fn((_auth: unknown) => Promise.resolve());
const currentUser = { uid: 'uid-a', isAnonymous: true };

vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn(),
  signOut: (auth: unknown) => signOutMock(auth),
}));

vi.mock('../lib/firebase/config', () => ({
  isFirebaseConfigured: vi.fn(() => true),
}));

vi.mock('../lib/firebase/init', () => ({
  getFirebaseAuth: vi.fn(() => ({
    currentUser,
  })),
}));

import { signOutFirebaseAuth } from '../lib/firebase/auth';
import { isFirebaseConfigured } from '../lib/firebase/config';
import { getFirebaseAuth } from '../lib/firebase/init';

describe('signOutFirebaseAuth', () => {
  beforeEach(() => {
    signOutMock.mockClear();
    vi.mocked(isFirebaseConfigured).mockReturnValue(true);
    vi.mocked(getFirebaseAuth).mockReturnValue({
      currentUser,
    } as ReturnType<typeof getFirebaseAuth>);
  });

  it('signs out when Firebase is configured and a user is signed in', async () => {
    await signOutFirebaseAuth();

    expect(signOutMock).toHaveBeenCalledOnce();
  });

  it('is a no-op when Firebase is not configured', async () => {
    vi.mocked(isFirebaseConfigured).mockReturnValue(false);

    await signOutFirebaseAuth();

    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('is a no-op when no user is signed in', async () => {
    vi.mocked(getFirebaseAuth).mockReturnValue({
      currentUser: null,
    } as ReturnType<typeof getFirebaseAuth>);

    await signOutFirebaseAuth();

    expect(signOutMock).not.toHaveBeenCalled();
  });
});
