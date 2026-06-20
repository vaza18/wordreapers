/**
 * Dev-only timing for online word submit (debounce → Firebase → UI).
 */
export interface SubmitWordProfile {
  mark(label: string): void;
  finish(): void;
}

export function createSubmitWordProfile(normalized: string): SubmitWordProfile | null {
  if (typeof __DEV__ === 'undefined' || !__DEV__) {
    return null;
  }
  const startedAt = performance.now();
  let lastAt = startedAt;
  const segments: string[] = [];

  return {
    mark(label: string) {
      const now = performance.now();
      segments.push(`${label} +${(now - lastAt).toFixed(1)}ms`);
      lastAt = now;
    },
    finish() {
      const totalMs = performance.now() - startedAt;
      console.log(`[submitWord ${normalized}] total ${totalMs.toFixed(1)}ms`, segments.join(' | '));
    },
  };
}
