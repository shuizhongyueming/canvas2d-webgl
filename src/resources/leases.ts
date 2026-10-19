import { createCompatError, ERROR_CODES } from "../contracts/errors.js";
import type { ResourceHandle, ResourceLease } from "../internal/contracts.js";

/**
 * Reference-counted leases over opaque GPU payloads. A handle binds the device
 * generation that created it; invalidating a generation deletes its payloads
 * exactly once, and releasing a stale lease afterwards is a no-op that can
 * never reach a newer resource (ids are never reused).
 */
export interface LeaseRegistry<T> {
  acquire(generation: number, payload: T): ResourceLease;
  retain(handle: ResourceHandle): ResourceLease;
  /** Live payload for a handle, only while the registry still holds it. */
  payload(handle: ResourceHandle): T | undefined;
  invalidateGeneration(generation: number): void;
  releaseAll(): void;
  counts(): { resources: number; leases: number };
}

interface Entry<T> {
  readonly generation: number;
  readonly payload: T;
  refs: number;
}

export function createLeaseRegistry<T>(
  onDelete: (payload: T) => void,
): LeaseRegistry<T> {
  let nextId = 1;
  const entries = new Map<number, Entry<T>>();
  const makeLease = (id: number, generation: number): ResourceLease => {
    let released = false;
    return {
      handle: Object.freeze({ id, generation }),
      release() {
        if (released) return;
        released = true;
        const entry = entries.get(id);
        if (!entry) return;
        entry.refs -= 1;
        if (entry.refs === 0) {
          entries.delete(id);
          onDelete(entry.payload);
        }
      },
    };
  };
  const remove = (id: number, entry: Entry<T>, drained: Array<Entry<T>>) => {
    entries.delete(id);
    drained.push(entry);
  };
  return {
    acquire(generation, payload) {
      const id = nextId++;
      entries.set(id, { generation, payload, refs: 1 });
      return makeLease(id, generation);
    },
    retain(handle) {
      const entry = entries.get(handle.id);
      if (!entry || entry.generation !== handle.generation)
        throw createCompatError(
          ERROR_CODES.CONTRACT,
          `stale resource handle: ${handle.id}`,
        );
      entry.refs += 1;
      return makeLease(handle.id, handle.generation);
    },
    payload(handle) {
      const entry = entries.get(handle.id);
      return entry && entry.generation === handle.generation
        ? entry.payload
        : undefined;
    },
    invalidateGeneration(generation) {
      const drained: Array<Entry<T>> = [];
      for (const [id, entry] of entries)
        if (entry.generation === generation) remove(id, entry, drained);
      for (const entry of drained) onDelete(entry.payload);
    },
    releaseAll() {
      const drained = [...entries.values()];
      entries.clear();
      for (const entry of drained) onDelete(entry.payload);
    },
    counts() {
      let leases = 0;
      for (const entry of entries.values()) leases += entry.refs;
      return { resources: entries.size, leases };
    },
  };
}
