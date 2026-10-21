export interface RasterLease<T> {
  readonly value: T;
  /** Idempotent; the underlying entry survives while the cache or another lease holds it. */
  release(): void;
}

interface Entry<T> {
  value: T;
  pixels: number;
  destroy: (value: T) => void;
  pins: number;
  stale: boolean;
  destroyed: boolean;
}

export interface RasterCacheOptions {
  readonly maxEntries?: number;
  readonly maxPixels?: number;
}

const DEFAULT_MAX_ENTRIES = 64;
const DEFAULT_MAX_PIXELS = 16 * 1024 * 1024;

/**
 * Bounded LRU for native raster assets. Pinned entries (an in-flight draw holds a
 * lease) are never evicted; destruction happens exactly once per entry. The caller
 * embeds its invalidation epoch in keys, so clear() only needs to retire entries.
 */
export class RasterCache<T> {
  readonly #maxEntries: number;
  readonly #maxPixels: number;
  readonly #entries = new Map<string, Entry<T>>();
  #pixels = 0;

  constructor(options: RasterCacheOptions = {}) {
    this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.#maxPixels = options.maxPixels ?? DEFAULT_MAX_PIXELS;
  }

  get size(): number {
    return this.#entries.size;
  }

  get pixels(): number {
    return this.#pixels;
  }

  acquire(key: string): RasterLease<T> | null {
    const entry = this.#entries.get(key);
    if (!entry || entry.stale) return null;
    // Refresh recency.
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return this.#pin(entry);
  }

  /**
   * Insert and pin a freshly rendered entry. Returns null when the entry cannot
   * fit the budgets — alone or alongside pinned entries — in which case the
   * caller keeps ownership and must destroy the value itself.
   */
  store(
    key: string,
    value: T,
    pixels: number,
    destroy: (value: T) => void,
  ): RasterLease<T> | null {
    if (this.#entries.has(key))
      throw new Error(`contract-violation: duplicate raster cache key ${key}`);
    if (pixels > this.#maxPixels) return null;
    const entry: Entry<T> = {
      value,
      pixels,
      destroy,
      pins: 0,
      stale: false,
      destroyed: false,
    };
    this.#entries.set(key, entry);
    this.#pixels += pixels;
    this.#evictExcept(entry);
    if (
      this.#entries.size > this.#maxEntries ||
      this.#pixels > this.#maxPixels
    ) {
      this.#entries.delete(key);
      this.#pixels -= pixels;
      return null;
    }
    return this.#pin(entry);
  }

  /** Retire every entry; pinned ones are destroyed when their last lease releases. */
  clear(): void {
    for (const entry of this.#entries.values()) {
      entry.stale = true;
      if (!entry.pins) this.#destroy(entry);
    }
    this.#entries.clear();
    this.#pixels = 0;
  }

  #pin(entry: Entry<T>): RasterLease<T> {
    entry.pins += 1;
    let released = false;
    return {
      value: entry.value,
      release: () => {
        if (released) return;
        released = true;
        entry.pins -= 1;
        if (!entry.pins && entry.stale) this.#destroy(entry);
      },
    };
  }

  /** Oldest-first eviction of unpinned entries, excluding the entry being stored. */
  #evictExcept(keep: Entry<T>): void {
    for (const [key, entry] of this.#entries) {
      if (
        this.#entries.size <= this.#maxEntries &&
        this.#pixels <= this.#maxPixels
      )
        return;
      if (entry === keep || entry.pins) continue;
      this.#entries.delete(key);
      this.#pixels -= entry.pixels;
      this.#destroy(entry);
    }
  }

  #destroy(entry: Entry<T>): void {
    if (entry.destroyed) return;
    entry.destroyed = true;
    entry.destroy(entry.value);
  }
}
