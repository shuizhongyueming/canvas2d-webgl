import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../../../dist/canvas/session.js";

function fakeDevice() {
  const calls = [];
  return {
    calls,
    generation: 0,
    status: "active",
    width: 8,
    height: 6,
    draw() {},
    present() {},
    resize(width, height) {
      calls.push(["resize", width, height]);
      this.width = width;
      this.height = height;
      this.generation += 1;
    },
    lose() {
      calls.push(["lose"]);
      this.status = "lost";
      this.generation += 1;
    },
    restore() {
      calls.push(["restore"]);
      this.status = "active";
      this.generation += 1;
    },
    dispose() {
      calls.push(["dispose"]);
      this.status = "disposed";
      this.generation += 1;
    },
    acquireTexture() {},
    retain() {},
  };
}

function fakeParts() {
  const order = [];
  const device = fakeDevice();
  const record = (name) => () => order.push(name);
  return {
    order,
    device,
    state: {
      save() {},
      restore() {},
      reset: record("state.reset"),
      snapshot() {},
      set() {},
      get() {},
    },
    path: {
      begin() {},
      append() {},
      snapshot() {},
      reset: record("path.reset"),
    },
    raster: {
      path() {},
      text() {},
      clip() {},
      measureWidth() {},
      clearCache: record("raster.clearCache"),
      dispose: record("raster.dispose"),
    },
  };
}

test("session resize routes to the device, then resets state, path and cache", () => {
  const parts = fakeParts();
  const session = createSession({ ...parts, onContextLost: undefined, onContextRestored: undefined });
  session.resize(10, 4);
  assert.deepEqual(parts.device.calls, [["resize", 10, 4]]);
  assert.deepEqual(parts.order, ["state.reset", "path.reset", "raster.clearCache"]);
});

test("session resize is silently ineffective while the device is lost", () => {
  const parts = fakeParts();
  const session = createSession({ ...parts, onContextLost: undefined, onContextRestored: undefined });
  parts.device.lose();
  parts.device.calls.length = 0;
  session.resize(10, 4);
  assert.deepEqual(parts.device.calls, []);
  assert.deepEqual(parts.order, []);
});

test("session resize propagates device failure without resetting state", () => {
  const parts = fakeParts();
  const failure = Object.assign(new Error("size refused"), { code: "size-unsupported" });
  parts.device.resize = () => {
    throw failure;
  };
  const session = createSession({ ...parts, onContextLost: undefined, onContextRestored: undefined });
  assert.throws(() => session.resize(0, 0), (error) => error === failure);
  assert.deepEqual(parts.order, []);
});

test("session dispose is idempotent and releases device and rasterizer", () => {
  const parts = fakeParts();
  const session = createSession({ ...parts, onContextLost: undefined, onContextRestored: undefined });
  session.dispose();
  session.dispose();
  assert.equal(session.disposed, true);
  assert.deepEqual(parts.device.calls, [["dispose"]]);
  assert.deepEqual(parts.order, ["raster.dispose"]);
  assert.throws(() => session.resize(2, 2), (error) => error.code === "disposed");
  session.notifyLost();
  session.notifyRestored();
  assert.deepEqual(parts.device.calls, [["dispose"]]);
});

test("session lost/restore entries drive the device and notify callbacks", () => {
  const parts = fakeParts();
  const events = [];
  const session = createSession({
    ...parts,
    onContextLost: () => events.push("lost"),
    onContextRestored: () => events.push("restored"),
  });
  session.notifyRestored();
  assert.deepEqual(parts.device.calls, []);
  session.notifyLost();
  session.notifyLost();
  assert.deepEqual(parts.device.calls, [["lose"]]);
  assert.deepEqual(events, ["lost"]);
  session.notifyRestored();
  assert.deepEqual(parts.device.calls, [["lose"], ["restore"]]);
  assert.deepEqual(events, ["lost", "restored"]);
  assert.deepEqual(parts.order, ["raster.clearCache"]);
});
