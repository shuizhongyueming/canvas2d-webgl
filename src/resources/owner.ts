import type { ResourceOwner } from "../internal/contracts.js";

/**
 * Shared cleanup stack for one compat canvas. Registered cleanups run in
 * reverse acquisition order; a failing cleanup never blocks the remaining
 * releases, and the first failure is rethrown after the stack is drained.
 */
export function createResourceOwner(): ResourceOwner {
  const cleanups: Array<() => void> = [];
  return {
    register(cleanup: () => void): () => void {
      let registered = true;
      cleanups.push(cleanup);
      return () => {
        if (!registered) return;
        registered = false;
        const index = cleanups.indexOf(cleanup);
        if (index >= 0) cleanups.splice(index, 1);
      };
    },
    releaseAll(): void {
      let failed = false;
      let failure: unknown;
      while (cleanups.length) {
        try {
          cleanups.pop()?.();
        } catch (error) {
          if (!failed) {
            failed = true;
            failure = error;
          }
        }
      }
      if (failed) throw failure;
    },
  };
}
