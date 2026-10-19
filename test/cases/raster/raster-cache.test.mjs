import test from "node:test";
import assert from "node:assert/strict";
import { RasterCache } from "../../../dist/raster/cache.js";

function entry(pixels = 4) {
  const record = { destroyed: 0 };
  return {
    record,
    value: { id: Symbol("asset") },
    pixels,
    destroy: () => {
      record.destroyed += 1;
    },
  };
}

test("a hit returns the same value; a miss is reported", () => {
  const cache = new RasterCache();
  const first = entry();
  const lease = cache.store("k", first.value, first.pixels, first.destroy);
  assert.ok(lease);
  const hit = cache.acquire("k");
  assert.ok(hit);
  assert.equal(hit.value, first.value);
  assert.equal(cache.acquire("absent"), null);
  lease.release();
  hit.release();
});

test("release is idempotent and double release does not unpin twice", () => {
  const cache = new RasterCache({ maxEntries: 1 });
  const first = entry();
  const lease = cache.store("a", first.value, first.pixels, first.destroy);
  assert.ok(lease);
  lease.release();
  lease.release();
  const second = entry();
  cache.store("b", second.value, second.pixels, second.destroy)?.release();
  assert.equal(first.record.destroyed, 1);
  assert.equal(cache.size, 1);
});

test("LRU eviction drops the oldest unpinned entry and destroys it exactly once", () => {
  const cache = new RasterCache({ maxEntries: 2 });
  const made = [entry(), entry(), entry(), entry()];
  const park = (i) =>
    cache.store(String(i), made[i].value, made[i].pixels, made[i].destroy)?.release();
  park(0);
  park(1);
  park(2);
  assert.equal(cache.size, 2);
  assert.equal(made[0].record.destroyed, 1);
  assert.equal(made[1].record.destroyed, 0);
  assert.equal(made[2].record.destroyed, 0);
  // Recency refresh: re-acquire entry 1, then insert 3; entry 2 must go first.
  const again = cache.acquire("1");
  assert.ok(again);
  again.release();
  park(3);
  assert.equal(made[1].record.destroyed, 0);
  assert.equal(made[2].record.destroyed, 1);
  assert.equal(made[3].record.destroyed, 0);
  assert.equal(cache.size, 2);
});

test("an entry that does not fit alongside pinned entries stays uncached", () => {
  const cache = new RasterCache({ maxEntries: 1 });
  const first = entry();
  const held = cache.store("a", first.value, first.pixels, first.destroy);
  assert.ok(held);
  const second = entry();
  assert.equal(cache.store("b", second.value, second.pixels, second.destroy), null);
  // Ownership stayed with the caller; the cache never destroys it.
  assert.equal(first.record.destroyed, 0);
  assert.equal(second.record.destroyed, 0);
  second.destroy();
  assert.equal(second.record.destroyed, 1);
  held.release();
  const third = entry();
  cache.store("c", third.value, third.pixels, third.destroy)?.release();
  assert.equal(first.record.destroyed, 1);
  assert.equal(cache.size, 1);
});

test("the pixel budget is enforced and oversized entries stay uncached", () => {
  const cache = new RasterCache({ maxPixels: 10 });
  const big = entry(11);
  assert.equal(cache.store("big", big.value, big.pixels, big.destroy), null);
  assert.equal(cache.size, 0);
  const small = entry(6);
  cache.store("s1", small.value, small.pixels, small.destroy)?.release();
  const next = entry(6);
  cache.store("s2", next.value, next.pixels, next.destroy)?.release();
  assert.equal(small.record.destroyed, 1);
  assert.equal(next.record.destroyed, 0);
  assert.ok(cache.pixels <= 10);
});

test("clear() destroys unpinned entries once and retires pinned ones on release", () => {
  const cache = new RasterCache();
  const pinned = entry();
  const idle = entry();
  const lease = cache.store("held", pinned.value, pinned.pixels, pinned.destroy);
  assert.ok(lease);
  cache.store("idle", idle.value, idle.pixels, idle.destroy)?.release();
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(idle.record.destroyed, 1);
  assert.equal(pinned.record.destroyed, 0);
  assert.equal(cache.acquire("held"), null);
  lease.release();
  assert.equal(pinned.record.destroyed, 1);
  cache.clear();
  assert.equal(pinned.record.destroyed, 1);
  assert.equal(idle.record.destroyed, 1);
});

test("duplicate keys are a contract violation", () => {
  const cache = new RasterCache();
  const first = entry();
  cache.store("k", first.value, first.pixels, first.destroy).release();
  assert.throws(
    () => cache.store("k", entry().value, 1, () => {}),
    /contract-violation/,
  );
});
