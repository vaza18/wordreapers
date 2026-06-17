declare module '@firebase/auth/dist/rn/index.js' {
  import type { Persistence } from 'firebase/auth';

  export function getReactNativePersistence(storage: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
  }): Persistence;
}
