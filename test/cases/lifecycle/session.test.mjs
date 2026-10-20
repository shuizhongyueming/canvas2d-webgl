import test from "node:test";
import assert from "node:assert/strict";
import { createStateStore } from "../../../dist/context/state.js";
import { PathRecorder } from "../../../dist/path/recorder.js";
import { createLifecycleRegistry } from "../../../dist/lifecycle/registry.js";
import { createSession } from "../../../dist/lifecycle/session.js";

const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);

function stubPaint(id) {
  return {
    id,
    version: 0,
    snapshot() {
      return Object.freeze({
        kind: "solid",
        color: Object.freeze([0, 0, 0, 1]),
      });
    },
  };
}

function makeClip(id) {
  return {
    id,
    parent: null,
    path: { id, commands: [] },
    rule: "nonzero",
  };
}

function fakeDevice(options = {}) {
  const device = {
    status: "active",
    generation: 1,
    width: 8,
    height: 6,
    resizeCalls: [],
    loseCalls: 0,
    restoreCalls: 0,
    disposeCalls: 0,
    failure: null,
    resize(width, height) {
      this.resizeCalls.push([width, height]);
      if (this.failure) throw this.failure;
      if (this.status === "lost") return;
      this.width = width;
      this.height = height;
      this.generation += 1;
    },
    lose() {
      this.loseCalls += 1;
      this.generation += 1;
      this.status = "lost";
    },
    restore() {
      this.restoreCalls += 1;
      this.generation += 1;
      this.status = "active";
    },
    dispose() {
      this.disposeCalls += 1;
      this.status = "disposed";
    },
  };
  return Object.assign(device, options);
}

function fakeRaster() {
  return {
    clearCalls: 0,
    disposeCalls: 0,
    clearCache() {
      this.clearCalls += 1;
    },
    dispose() {
      this.disposeCalls += 1;
    },
  };
}

function fakeTarget() {
  const listeners = new Map();
  const target = {
    listeners,
    added: 0,
    removed: 0,
    addEventListener(type, listener) {
      this.added += 1;
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    removeEventListener(type, listener) {
      this.removed += 1;
      const list = listeners.get(type) ?? [];
      const index = list.indexOf(listener);
      if (index >= 0) list.splice(index, 1);
      listeners.set(type, list);
    },
    dispatch(type, event = {}) {
      let prevented = false;
      const payload = {
        preventDefault() {
          prevented = true;
        },
        ...event,
      };
      for (const listener of [...(listeners.get(type) ?? [])])
        listener(payload);
      return prevented;
    },
  };
  return target;
}

function setup(options = {}) {
  const state = createStateStore({
    fill: stubPaint(0),
    stroke: stubPaint(1),
  });
  const path = new PathRecorder();
  const device = fakeDevice(options.device);
  const raster = fakeRaster();
  const lifecycle = createLifecycleRegistry();
  const target = fakeTarget();
  const events = [];
  const session = createSession({
    device,
    raster,
    state,
    path,
    lifecycle,
    target,
    onContextLost: options.onContextLost ?? (() => events.push("lost")),
    onContextRestored:
      options.onContextRestored ?? (() => events.push("restored")),
  });
  return { state, path, device, raster, lifecycle, target, events, session };
}

test("a successful resize resets state, stack, path and caches even at the same size", () => {
  const { state, path, device, raster, lifecycle, session } = setup();
  const resets = [];
  lifecycle.register({ reset: () => resets.push("reset") });
  state.set("alpha", 0.4);
  state.set("clip", makeClip(7));
  state.save();
  path.moveTo(1, 2, IDENTITY);

  session.resize(8, 6);

  assert.deepEqual(device.resizeCalls, [[8, 6]], "same size still reaches the device");
  assert.equal(state.get("alpha"), 1);
  assert.equal(state.get("clip"), null);
  assert.equal(path.snapshot().commands.length, 0);
  assert.equal(raster.clearCalls, 1);
  assert.deepEqual(resets, ["reset"]);
  // The stack is gone: restore() cannot bring the pre-resize alpha back.
  state.restore();
  assert.equal(state.get("alpha"), 1);
});

test("a rejected resize leaves state, path and caches untouched", () => {
  const { state, path, device, raster, lifecycle, session } = setup();
  const resets = [];
  lifecycle.register({ reset: () => resets.push("reset") });
  const clip = makeClip(3);
  state.set("alpha", 0.4);
  state.set("clip", clip);
  path.moveTo(1, 2, IDENTITY);
  device.failure = Object.assign(new Error("refused"), {
    code: "size-unsupported",
  });

  assert.throws(() => session.resize(0, 6), { code: "size-unsupported" });
  assert.equal(state.get("alpha"), 0.4);
  assert.equal(state.get("clip"), clip);
  assert.equal(path.snapshot().commands.length, 1);
  assert.equal(raster.clearCalls, 0);
  assert.deepEqual(resets, []);
});

test("loss pauses the session, remains silent for resize, and notifies once", () => {
  const { device, raster, lifecycle, events, session, state } = setup();
  const hooks = [];
  lifecycle.register({ lost: () => hooks.push("lost") });
  state.set("alpha", 0.4);
  state.save();

  session.notifyLost();
  session.notifyLost(); // a repeated platform event is ignored
  assert.equal(device.loseCalls, 1);
  assert.deepEqual(hooks, ["lost"]);
  assert.deepEqual(events, ["lost"]);
  const clears = raster.clearCalls;

  assert.doesNotThrow(() => session.resize(4, 4));
  assert.deepEqual(device.resizeCalls, [], "resize is not queued while lost");
  assert.equal(device.width, 8);
  assert.equal(raster.clearCalls, clears);

  // Loss itself does not reset the drawing state; only the restoration drops
  // generation-bound state such as the clip.
  assert.equal(state.get("alpha"), 0.4);
});

test("restoration rebuilds through the device, drops the clip and clears caches", () => {
  const { device, raster, lifecycle, events, session, state } = setup();
  const order = [];
  lifecycle.register({
    restored: () => {
      order.push("feature");
      // The scene must already be a fresh transparent one at this point.
      assert.equal(state.get("clip"), null);
    },
  });
  state.set("clip", makeClip(5));
  session.notifyLost();

  session.notifyRestored();
  session.notifyRestored(); // not lost anymore, ignored
  assert.equal(device.restoreCalls, 1);
  assert.equal(state.get("clip"), null);
  assert.equal(raster.clearCalls, 1);
  assert.deepEqual(order, ["feature"]);
  assert.deepEqual(events, ["lost", "restored"]);
});

test("restoration before a loss is ignored", () => {
  const { device, session, events } = setup();
  session.notifyRestored();
  assert.equal(device.restoreCalls, 0);
  assert.deepEqual(events, []);
});

test("dispose removes library listeners and drains exactly once", () => {
  const { device, raster, lifecycle, target, events, session } = setup();
  const disposed = [];
  lifecycle.register({ disposed: () => disposed.push("hooks") });

  session.dispose();
  session.dispose();

  assert.equal(session.disposed, true);
  assert.equal(device.disposeCalls, 1);
  assert.equal(raster.disposeCalls, 1);
  assert.deepEqual(disposed, ["hooks"]);
  assert.equal(target.listeners.get("webglcontextlost").length, 0);
  assert.equal(target.listeners.get("webglcontextrestored").length, 0);

  // A late platform event cannot re-enter the disposed session.
  target.dispatch("webglcontextlost");
  target.dispatch("webglcontextrestored");
  assert.equal(device.loseCalls, 0);
  assert.equal(device.restoreCalls, 0);
  assert.deepEqual(events, []);
  assert.throws(() => session.resize(4, 4), { code: "disposed" });
  assert.throws(() => lifecycle.register({}), { code: "disposed" });
});

test("DOM loss/restore events are cancelled for restoration and reach the callbacks", () => {
  const { device, target, events } = setup();
  const prevented = target.dispatch("webglcontextlost");
  assert.equal(prevented, true, "the library handles the loss so it can restore");
  assert.equal(device.loseCalls, 1);
  assert.deepEqual(events, ["lost"]);

  target.dispatch("webglcontextrestored");
  assert.equal(device.restoreCalls, 1);
  assert.deepEqual(events, ["lost", "restored"]);
});

test("a size assignment while lost is silent even for dimensions a live resize rejects", () => {
  const { device, session } = setup();
  session.notifyLost();
  assert.doesNotThrow(() => session.resize(0, 0));
  assert.deepEqual(device.resizeCalls, []);
});

test("hook failures do not leave the transition half-applied", () => {
  const { state, path, raster, lifecycle, session } = setup();
  lifecycle.register({
    reset: () => {
      throw new Error("feature reset failed");
    },
  });
  state.set("alpha", 0.25);
  path.moveTo(1, 1, IDENTITY);
  assert.throws(() => session.resize(4, 4), /feature reset failed/);
  assert.equal(state.get("alpha"), 1, "state cleanup still ran");
  assert.equal(path.snapshot().commands.length, 0);
  assert.equal(raster.clearCalls, 1);
});

test("lifecycle registration is validated and disposed in reverse order", () => {
  const registry = createLifecycleRegistry();
  const order = [];
  const first = { disposed: () => order.push("first") };
  const second = { disposed: () => order.push("second") };
  registry.register(first);
  registry.register(second);

  assert.throws(() => registry.register(first), { code: "contract-violation" });
  assert.throws(
    () => registry.register({ unknown: () => undefined }),
    { code: "contract-violation" },
  );
  registry.disposed();
  assert.deepEqual(order, ["second", "first"]);
  registry.disposed();
  assert.deepEqual(order, ["second", "first"], "disposal is idempotent");
});

test("the registry drains remaining hooks when one throws", () => {
  const registry = createLifecycleRegistry();
  const calls = [];
  registry.register({
    lost: () => {
      calls.push("first");
      throw new Error("boom");
    },
  });
  registry.register({ lost: () => calls.push("second") });
  assert.throws(() => registry.lost(), /boom/);
  assert.deepEqual(calls, ["first", "second"]);
});
