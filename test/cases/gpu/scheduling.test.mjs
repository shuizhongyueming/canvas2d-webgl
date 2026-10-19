import test from "node:test";
import assert from "node:assert/strict";
import {
  createPresenter,
  PRESENT_INVALIDATED,
} from "../../../dist/scheduling/presenter.js";

const microtask = () => Promise.resolve();
const task = () => new Promise((resolve) => setTimeout(resolve, 0));

function settle(promise) {
  return promise.then(
    () => ({ settled: "resolved" }),
    (error) => ({ settled: "rejected", code: error?.code }),
  );
}

test("a synchronous burst coalesces into a single microtask present", async () => {
  const log = [];
  const presenter = createPresenter({
    currentGeneration: () => 7,
    present: (generation) => log.push(["present", generation]),
  });
  presenter.request(7);
  presenter.request(7);
  presenter.request(7);
  assert.equal(log.length, 0);
  await microtask();
  assert.deepEqual(log, [["present", 7]]);
  await task();
  assert.deepEqual(log, [["present", 7]]);
});

test("stale requests never schedule a present", async () => {
  const log = [];
  const presenter = createPresenter({
    currentGeneration: () => 2,
    present: (generation) => log.push(["present", generation]),
  });
  presenter.request(1);
  await task();
  assert.deepEqual(log, []);
});

test("invalidate cancels the queued callback and rejects its waiters", async () => {
  const log = [];
  const presenter = createPresenter({
    currentGeneration: () => 1,
    present: (generation) => log.push(["present", generation]),
  });
  presenter.request(1);
  const waiting = settle(presenter.whenPresented(1));
  presenter.invalidate(1);
  assert.deepEqual(await waiting, {
    settled: "rejected",
    code: PRESENT_INVALIDATED,
  });
  await task();
  assert.deepEqual(log, []);
});

test("whenPresented never hangs and never triggers a present itself", async () => {
  const log = [];
  let generation = 3;
  const presenter = createPresenter({
    currentGeneration: () => generation,
    present: (value) => log.push(["present", value]),
  });
  await presenter.whenPresented(3);
  assert.deepEqual(log, []);
  await settle(presenter.whenPresented(2)).then((outcome) =>
    assert.deepEqual(outcome, {
      settled: "rejected",
      code: PRESENT_INVALIDATED,
    }),
  );
  presenter.request(3);
  const waiting = presenter.whenPresented(3);
  assert.deepEqual(log, []);
  await waiting;
  assert.deepEqual(log, [["present", 3]]);
});

test("generation rollover supersedes a queued present", async () => {
  const log = [];
  let generation = 1;
  const presenter = createPresenter({
    currentGeneration: () => generation,
    present: (value) => log.push(["present", value]),
  });
  presenter.request(1);
  const staleWait = settle(presenter.whenPresented(1));
  presenter.invalidate(1);
  generation = 2;
  presenter.request(2);
  await presenter.whenPresented(2);
  assert.deepEqual(await staleWait, {
    settled: "rejected",
    code: PRESENT_INVALIDATED,
  });
  assert.deepEqual(log, [["present", 2]]);
});

test("waiters resolve only after the present has run", async () => {
  const log = [];
  const presenter = createPresenter({
    currentGeneration: () => 0,
    present: () => log.push("present"),
  });
  presenter.request(0);
  await presenter.whenPresented(0).then(() => log.push("waiter"));
  assert.deepEqual(log, ["present", "waiter"]);
});
