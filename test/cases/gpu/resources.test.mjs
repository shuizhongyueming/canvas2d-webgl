import test from "node:test";
import assert from "node:assert/strict";
import { createResourceOwner } from "../../../dist/resources/owner.js";
import { createLeaseRegistry } from "../../../dist/resources/leases.js";

test("resource owner drains cleanups in reverse acquisition order", () => {
  const owner = createResourceOwner();
  const order = [];
  owner.register(() => order.push("first"));
  owner.register(() => order.push("second"));
  owner.register(() => order.push("third"));
  owner.releaseAll();
  assert.deepEqual(order, ["third", "second", "first"]);
});

test("resource owner drains everything and rethrows the first failure", () => {
  const owner = createResourceOwner();
  const order = [];
  const first = Error("first failure");
  owner.register(() => order.push("a"));
  owner.register(() => {
    order.push("b");
    throw Error("second failure");
  });
  owner.register(() => {
    order.push("c");
    throw first;
  });
  assert.throws(() => owner.releaseAll(), (error) => error === first);
  assert.deepEqual(order, ["c", "b", "a"]);
});

test("unregister transfers cleanup responsibility and is idempotent", () => {
  const owner = createResourceOwner();
  const order = [];
  owner.register(() => order.push("kept"));
  const unregister = owner.register(() => order.push("transferred"));
  unregister();
  unregister();
  owner.releaseAll();
  assert.deepEqual(order, ["kept"]);
  owner.releaseAll();
  assert.deepEqual(order, ["kept"]);
});

test("lease registry reference counting deletes payloads on last release", () => {
  const deleted = [];
  const registry = createLeaseRegistry((payload) => deleted.push(payload));
  const lease = registry.acquire(0, "texture-a");
  assert.deepEqual(registry.counts(), { resources: 1, leases: 1 });
  const retained = registry.retain(lease.handle);
  assert.deepEqual(registry.counts(), { resources: 1, leases: 2 });
  assert.equal(registry.payload(lease.handle), "texture-a");
  lease.release();
  assert.deepEqual(registry.counts(), { resources: 1, leases: 1 });
  assert.deepEqual(deleted, []);
  retained.release();
  assert.deepEqual(registry.counts(), { resources: 0, leases: 0 });
  assert.deepEqual(deleted, ["texture-a"]);
  retained.release();
  assert.deepEqual(deleted, ["texture-a"]);
});

test("stale generation release cannot delete a newer resource", () => {
  const deleted = [];
  const registry = createLeaseRegistry((payload) => deleted.push(payload));
  const stale = registry.acquire(0, "old");
  registry.acquire(0, "sibling");
  registry.invalidateGeneration(0);
  assert.deepEqual(deleted.sort(), ["old", "sibling"]);
  assert.deepEqual(registry.counts(), { resources: 0, leases: 0 });
  const fresh = registry.acquire(1, "new");
  stale.release();
  assert.deepEqual(deleted.sort(), ["old", "sibling"]);
  assert.equal(registry.payload(fresh.handle), "new");
  fresh.release();
  assert.ok(deleted.includes("new"));
});

test("retain of a stale handle fails explicitly", () => {
  const registry = createLeaseRegistry(() => {});
  const stale = registry.acquire(0, "old");
  registry.invalidateGeneration(0);
  assert.throws(
    () => registry.retain(stale.handle),
    (error) => error.code === "contract-violation",
  );
  assert.throws(
    () => registry.retain({ id: 999, generation: 1 }),
    (error) => error.code === "contract-violation",
  );
});

test("releaseAll deletes every remaining payload once", () => {
  const deleted = [];
  const registry = createLeaseRegistry((payload) => deleted.push(payload));
  const a = registry.acquire(3, "a");
  registry.acquire(3, "b");
  registry.releaseAll();
  assert.deepEqual(deleted.sort(), ["a", "b"]);
  a.release();
  assert.deepEqual(deleted.sort(), ["a", "b"]);
  assert.deepEqual(registry.counts(), { resources: 0, leases: 0 });
});
