import test from "node:test";
import assert from "node:assert/strict";
import { clipFeature } from "../../../dist/features/clip/feature.js";
import { createStateStore } from "../../../dist/context/state.js";
import { PathRecorder } from "../../../dist/path/recorder.js";

const IDENTITY = [1, 0, 0, 1, 0, 0];

function stubPaint(id) {
  return {
    id,
    version: 0,
    snapshot() {
      return { kind: "solid", color: [0, 0, 0, 1] };
    },
  };
}

function stubRasterSource(bounds) {
  return {
    kind: "raster",
    canvas: { width: 1, height: 1 },
    bounds,
    pixelWidth: 1,
    pixelHeight: 1,
    colorSpace: "srgb",
    alpha: "straight",
    release() {},
  };
}

function setup(overrides = {}) {
  const state = createStateStore({ fill: stubPaint(1), stroke: stubPaint(2) });
  const path = new PathRecorder();
  const gpu = { status: "active", ...overrides.gpu };
  const clipCalls = [];
  const raster = {
    clip(snapshot, rule, bounds) {
      clipCalls.push({ snapshot, rule, bounds });
      return stubRasterSource(bounds);
    },
  };
  const registrations = [];
  const lifecycle = {
    register(hooks) {
      registrations.push(hooks);
      return () => {};
    },
  };
  const feature = clipFeature({ state, path, gpu, raster, lifecycle });
  assert.equal(feature.id, "clip");
  const clip = (...args) => feature.members.clip.value(...args);
  return {
    state,
    path,
    gpu,
    raster,
    lifecycle,
    registrations,
    clipCalls,
    clip,
  };
}

function clipMessage(fn) {
  try {
    fn();
    return "ok";
  } catch (error) {
    return error.message;
  }
}

test("the factory requires state, a PathRecorder, gpu and raster", () => {
  const state = createStateStore({ fill: stubPaint(1), stroke: stubPaint(2) });
  const path = new PathRecorder();
  const gpu = { status: "active" };
  const raster = { clip() {} };
  assert.throws(() => clipFeature({}), { code: "contract-violation" });
  assert.throws(() => clipFeature({ state, path, gpu }), {
    code: "contract-violation",
  });
  assert.throws(() => clipFeature({ state, path, gpu, raster }), {
    code: "contract-violation",
  });
  const fakeStore = {
    begin() {},
    append() {},
    snapshot() {
      return { id: 1, commands: [] };
    },
    reset() {},
  };
  assert.throws(
    () =>
      clipFeature({
        state,
        path: fakeStore,
        gpu,
        raster,
        lifecycle: { register() {} },
      }),
    { code: "contract-violation" },
  );
});

test("registers the unified lifecycle hooks as explicit no-ops", () => {
  const { registrations, state, path, clip } = setup();
  assert.equal(registrations.length, 1);
  const hooks = registrations[0];
  assert.deepEqual(Object.keys(hooks).sort(), [
    "disposed",
    "lost",
    "reset",
    "restored",
  ]);
  path.begin();
  path.rect(0, 0, 8, 8, IDENTITY);
  clip();
  const captured = state.get("clip");
  // The session drops clips through StateStore.reset/discardClips before
  // running hooks and invalidates masks through raster.clearCache; the hooks
  // themselves must not duplicate that cleanup or throw.
  for (const name of Object.keys(hooks))
    assert.doesNotThrow(() => hooks[name]());
  assert.equal(state.get("clip"), captured);
});

test("clip captures the current path without consuming it", () => {
  const { state, path, clip } = setup();
  path.begin();
  path.rect(2, 3, 10, 12, IDENTITY);
  const before = path.snapshot();
  assert.equal(clip(), undefined);
  const captured = state.get("clip");
  assert.equal(captured.parent, null);
  assert.equal(captured.rule, "nonzero");
  assert.equal(captured.path.id, before.id);
  assert.equal(captured.path.commands.length, 1);
  // The current path is still the same recorder content.
  assert.equal(path.snapshot().id, before.id);
  assert.equal(path.snapshot().commands.length, 1);
});

test("the captured snapshot is immutable across later path edits", () => {
  const { state, path, clip } = setup();
  path.begin();
  path.rect(0, 0, 8, 8, IDENTITY);
  clip();
  const captured = state.get("clip");
  path.lineTo(20, 20, IDENTITY);
  path.begin();
  path.rect(4, 4, 4, 4, IDENTITY);
  assert.equal(captured.path.commands.length, 1);
  assert.equal(captured.path.commands[0].op, "rect");
});

test("each clip chains to the previous effective clip and records its rule", () => {
  const { state, path, clip } = setup();
  path.begin();
  path.rect(0, 0, 16, 16, IDENTITY);
  clip();
  const first = state.get("clip");
  path.begin();
  path.rect(4, 4, 8, 8, IDENTITY);
  clip("evenodd");
  const second = state.get("clip");
  assert.equal(second.parent, first);
  assert.equal(second.rule, "evenodd");
  assert.notEqual(second.id, first.id);
});

test("restore returns the previous clip reference, and reset clears it", () => {
  const { state, path, clip } = setup();
  state.save();
  clip();
  const captured = state.get("clip");
  state.restore();
  assert.equal(state.get("clip"), null);
  state.set("clip", captured);
  state.reset();
  assert.equal(state.get("clip"), null);
  // The mask provider survives independently of the state stack.
  assert.equal(typeof captured.mask, "function");
});

test("the mask provider resolves through the rasterizer with device bounds", () => {
  const { state, path, clip, clipCalls } = setup();
  path.begin();
  path.rect(1, 2, 3, 4, IDENTITY);
  clip("evenodd");
  const captured = state.get("clip");
  const bounds = { x: 0, y: 0, width: 64, height: 48 };
  const source = captured.mask(bounds);
  assert.equal(clipCalls.length, 1);
  assert.equal(clipCalls[0].rule, "evenodd");
  assert.deepEqual(clipCalls[0].bounds, bounds);
  assert.deepEqual(clipCalls[0].snapshot, captured.path);
  assert.equal(source.bounds, bounds);
});

test("lost contexts ignore clip without changing state; disposed throws", () => {
  const lost = setup({ gpu: { status: "lost" } });
  lost.path.begin();
  lost.path.rect(0, 0, 4, 4, IDENTITY);
  lost.clip();
  assert.equal(lost.state.get("clip"), null);

  const disposed = setup({ gpu: { status: "disposed" } });
  disposed.path.begin();
  disposed.path.rect(0, 0, 4, 4, IDENTITY);
  assert.throws(() => disposed.clip(), { code: "disposed" });
  assert.equal(disposed.state.get("clip"), null);
});

test("rule arguments follow native enum conversion and messages", () => {
  const { path, clip } = setup();
  path.begin();
  path.rect(0, 0, 4, 4, IDENTITY);
  // undefined is an absent optional argument.
  clip(undefined);
  clip("nonzero");
  clip("evenodd");
  assert.equal(
    clipMessage(() => clip("foo")),
    "Failed to execute 'clip' on 'CanvasRenderingContext2D': The provided value 'foo' is not a valid enum value of type CanvasFillRule.",
  );
  assert.equal(
    clipMessage(() => clip(null)),
    "Failed to execute 'clip' on 'CanvasRenderingContext2D': The provided value 'null' is not a valid enum value of type CanvasFillRule.",
  );
  assert.equal(
    clipMessage(() => clip(1)),
    "Failed to execute 'clip' on 'CanvasRenderingContext2D': The provided value '1' is not a valid enum value of type CanvasFillRule.",
  );
  assert.equal(
    clipMessage(() => clip(Symbol("x"))),
    "Failed to execute 'clip' on 'CanvasRenderingContext2D': Cannot convert a Symbol value to a string",
  );
  // Two arguments select the Path2D overload; a non-Path2D first argument
  // fails WebIDL overload resolution.
  assert.equal(
    clipMessage(() => clip("evenodd", 1)),
    "Failed to execute 'clip' on 'CanvasRenderingContext2D': parameter 1 is not of type 'Path2D'.",
  );
});

test("Path2D overloads report unsupported-api", () => {
  class FakePath2D {}
  const had = Object.prototype.hasOwnProperty.call(globalThis, "Path2D");
  const previous = globalThis.Path2D;
  globalThis.Path2D = FakePath2D;
  try {
    const { path, clip } = setup();
    path.begin();
    path.rect(0, 0, 4, 4, IDENTITY);
    assert.throws(() => clip(new FakePath2D()), {
      code: "unsupported-api",
    });
    assert.throws(() => clip(new FakePath2D(), "evenodd"), {
      code: "unsupported-api",
    });
  } finally {
    if (had) globalThis.Path2D = previous;
    else delete globalThis.Path2D;
  }
});
