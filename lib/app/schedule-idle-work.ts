/**
 * Schedule non-urgent work without blocking animations (replacement for deprecated InteractionManager.runAfterInteractions).
 */
export function scheduleIdleWork(task: () => void): () => void {
  const idle = globalThis as typeof globalThis & {
    requestIdleCallback?: (callback: () => void) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof idle.requestIdleCallback === 'function') {
    const handle = idle.requestIdleCallback(task);
    return () => {
      idle.cancelIdleCallback?.(handle);
    };
  }

  const timeout = setTimeout(task, 0);
  return () => clearTimeout(timeout);
}
