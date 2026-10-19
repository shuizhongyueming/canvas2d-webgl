import type { Presenter } from "../internal/contracts.js";

/** Rejection code for waiters whose generation was invalidated or superseded. */
export const PRESENT_INVALIDATED = "present-invalidated";

export interface ScheduledPresenter extends Presenter {
  /**
   * Wait for an already scheduled automatic present. Never triggers one:
   * resolves immediately when nothing is pending, rejects when the generation
   * is stale, and never hangs across resize/loss/dispose.
   */
  whenPresented(generation: number): Promise<void>;
}

export interface PresenterSource {
  currentGeneration(): number;
  present(generation: number): void;
}

/**
 * Commit point = the microtask checkpoint of the current task. Draw calls in
 * one task coalesce into a single present; invalidation cancels the pending
 * callback so a stale generation never reaches the scene or the display.
 */
export function createPresenter(source: PresenterSource): ScheduledPresenter {
  let pending: number | undefined;
  let scheduled = false;
  const waiters = new Map<
    number,
    Array<{ resolve(): void; reject(error: Error): void }>
  >();
  const invalidated = (generation: number) =>
    Object.assign(
      new Error(`present invalidated for generation ${generation}`),
      { code: PRESENT_INVALIDATED },
    );
  const takeWaiters = (generation: number) => {
    const waiting = waiters.get(generation) ?? [];
    waiters.delete(generation);
    return waiting;
  };
  const flush = () => {
    scheduled = false;
    const generation = pending;
    pending = undefined;
    if (generation === undefined) return;
    const waiting = takeWaiters(generation);
    if (generation === source.currentGeneration()) {
      source.present(generation);
      for (const waiter of waiting) waiter.resolve();
    } else {
      for (const waiter of waiting) waiter.reject(invalidated(generation));
    }
  };
  return {
    request(generation) {
      if (generation !== source.currentGeneration()) return;
      pending = generation;
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(flush);
      }
    },
    invalidate(generation) {
      if (pending === generation) pending = undefined;
      for (const waiter of takeWaiters(generation))
        waiter.reject(invalidated(generation));
    },
    whenPresented(generation) {
      if (generation !== source.currentGeneration())
        return Promise.reject(invalidated(generation));
      if (pending !== generation) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const waiting = waiters.get(generation) ?? [];
        waiting.push({ resolve, reject });
        waiters.set(generation, waiting);
      });
    },
  };
}
