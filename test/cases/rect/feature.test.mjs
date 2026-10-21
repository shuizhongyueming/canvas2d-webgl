import test from "node:test";
import assert from "node:assert/strict";
import { rectFeature } from "../../../dist/features/rect/feature.js";
import { createStateStore } from "../../../dist/context/state.js";

function stubPaint(id, paint = { kind: "solid", color: [0, 0, 0, 1] }) {
  return {
    id,
    version: 0,
    snapshot() {
      return Object.freeze({
        ...paint,
        ...(paint.color ? { color: Object.freeze([...paint.color]) } : {}),
      });
    },
  };
}

function stubRasterSource(bounds = { x: 1, y: 2, width: 10, height: 12 }) {
  return {
    kind: "raster",
    canvas: { width: bounds.width || 1, height: bounds.height || 1 },
    bounds,
    pixelWidth: bounds.width || 1,
    pixelHeight: bounds.height || 1,
    colorSpace: "srgb",
    alpha: "straight",
    releases: 0,
    release() {
      this.releases += 1;
    },
  };
}

function setup(overrides = {}) {
  const state = createStateStore({ fill: stubPaint(1), stroke: stubPaint(2) });
  const ops = [];
  const gpu = {
    generation: 7,
    status: "active",
    draw(op) {
      ops.push(op);
    },
    ...overrides.gpu,
  };
  const rasterCalls = [];
  const raster = {
    path(path, drawState, mode) {
      const source = stubRasterSource(overrides.rasterBounds);
      rasterCalls.push({ path, state: drawState, mode, source });
      return source;
    },
  };
  const feature = rectFeature({ state, gpu, raster, ...overrides.env });
  assert.equal(feature.id, "rect");
  return { state, gpu, ops, rasterCalls, members: feature.members };
}

test("the factory requires state, gpu and raster in the environment", () => {
  assert.throws(() => rectFeature({}), { code: "contract-violation" });
  const state = createStateStore({ fill: stubPaint(1), stroke: stubPaint(2) });
  assert.throws(() => rectFeature({ state }), { code: "contract-violation" });
});

test("missing arguments throw the native TypeError before any state is read", () => {
  const { members, ops } = setup();
  for (const name of ["fillRect", "clearRect", "strokeRect"]) {
    assert.throws(
      () => members[name].value(1, 2, 3),
      (error) =>
        error instanceof TypeError &&
        error.message ===
          `Failed to execute '${name}' on 'CanvasRenderingContext2D': 4 arguments required, but only 3 present.`,
    );
    assert.throws(() => members[name].value(), TypeError);
  }
  assert.equal(ops.length, 0);
});

test("BigInt and Symbol arguments reject with a native TypeError", () => {
  const { members, ops } = setup();
  assert.throws(() => members.fillRect.value(1n, 0, 4, 4), TypeError);
  assert.throws(() => members.clearRect.value(0, 0, 4, Symbol("x")), TypeError);
  assert.throws(() => members.strokeRect.value(0n, 0n, 0n, 0n), TypeError);
  assert.equal(ops.length, 0);
});

test("non-finite coordinates are silently ignored", () => {
  const { members, ops, rasterCalls } = setup();
  for (const bad of [NaN, Infinity, -Infinity, undefined]) {
    members.fillRect.value(bad, 0, 4, 4);
    members.clearRect.value(0, bad, 4, 4);
    members.strokeRect.value(0, 0, bad, 4);
  }
  assert.equal(ops.length, 0);
  assert.equal(rasterCalls.length, 0);
});

test("zero-area fills and clears are no-ops; strokeRect only skips both-zero", () => {
  const { members, ops, rasterCalls } = setup();
  members.fillRect.value(0, 0, 0, 5);
  members.fillRect.value(0, 0, 5, 0);
  members.clearRect.value(0, 0, 0, 5);
  members.clearRect.value(0, 0, 5, 0);
  members.strokeRect.value(0, 0, 0, 0);
  assert.equal(ops.length, 0);
  assert.equal(rasterCalls.length, 0);
  members.strokeRect.value(0, 0, 8, 0);
  members.strokeRect.value(0, 0, 0, 8);
  assert.equal(rasterCalls.length, 2);
  assert.equal(ops.length, 2);
});

test("solid fillRect submits a rect draw operation with the verbatim bounds", () => {
  const { members, ops } = setup();
  members.fillRect.value(1, 2, 30, 40);
  assert.equal(ops.length, 1);
  const [op] = ops;
  assert.equal(op.generation, 7);
  assert.equal(op.kind, "draw");
  assert.equal(op.clip, null);
  assert.deepEqual(op.sourceBounds, { x: 1, y: 2, width: 30, height: 40 });
  assert.equal(op.source.kind, "rect");
  assert.deepEqual(op.source.bounds, { x: 1, y: 2, width: 30, height: 40 });
  assert.deepEqual([...op.source.transform], [1, 0, 0, 1, 0, 0]);
  assert.deepEqual(op.source.paint, { kind: "solid", color: [0, 0, 0, 1] });
});

test("sourceBounds is the device-space hull under the draw transform", () => {
  const { state, members, ops } = setup();
  state.set("transform", [1, 0, 0, 1, 10, 20]);
  members.fillRect.value(1, 2, 30, 40);
  assert.deepEqual(ops[0].sourceBounds, {
    x: 11,
    y: 22,
    width: 30,
    height: 40,
  });
  state.set("transform", [0, 1, -1, 0, 0, 0]); // quarter turn
  members.fillRect.value(10, 20, 30, 40);
  assert.deepEqual(ops[1].sourceBounds, {
    x: -60,
    y: 10,
    width: 40,
    height: 30,
  });
});

test("negative dimensions stay verbatim for the GPU and normalize in sourceBounds", () => {
  const { members, ops } = setup();
  members.fillRect.value(40, 40, -10, -20);
  assert.deepEqual(ops[0].source.bounds, {
    x: 40,
    y: 40,
    width: -10,
    height: -20,
  });
  assert.deepEqual(ops[0].sourceBounds, {
    x: 30,
    y: 20,
    width: 10,
    height: 20,
  });
});

test("clearRect submits a clear operation that never consults the fill paint", () => {
  const { state, members, ops, rasterCalls } = setup();
  state.set("alpha", 0.25);
  members.clearRect.value(4, 5, 6, 7);
  assert.equal(rasterCalls.length, 0);
  const [op] = ops;
  assert.equal(op.kind, "clear");
  assert.equal(op.source.kind, "rect");
  assert.deepEqual(op.source.bounds, { x: 4, y: 5, width: 6, height: 7 });
  // The paint slot is inert filler; the state snapshot keeps the real alpha.
  assert.equal(op.state.alpha, 0.25);
  assert.deepEqual([...op.source.paint.color], [0, 0, 0, 1]);
});

test("non-solid fillRect rasterizes the rect path and releases the asset after draw", () => {
  const gradientPaint = {
    kind: "linear-gradient",
    id: 9,
    version: 3,
    from: [0, 0],
    to: [8, 0],
    stops: [],
  };
  const state = createStateStore({
    fill: stubPaint(1, gradientPaint),
    stroke: stubPaint(2),
  });
  const { members, ops, rasterCalls } = setup({ env: { state } });
  members.fillRect.value(2, 3, 8, 5);
  assert.equal(rasterCalls.length, 1);
  const [{ path, state: drawState, mode, source }] = rasterCalls;
  assert.equal(mode, "fill");
  assert.equal(drawState.fill.kind, "linear-gradient");
  assert.equal(path.commands.length, 1);
  assert.equal(path.commands[0].op, "rect");
  assert.deepEqual([...path.commands[0].args], [2, 3, 8, 5]);
  assert.deepEqual([...path.commands[0].transform], [1, 0, 0, 1, 0, 0]);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].kind, "draw");
  assert.equal(ops[0].source, source);
  assert.deepEqual(ops[0].sourceBounds, source.bounds);
  assert.equal(source.releases, 1);
});

test("strokeRect uses the stroke asset service with the draw-time transform", () => {
  const { state, members, ops, rasterCalls } = setup();
  state.set("transform", [2, 0, 0, 2, 5, 6]);
  state.set("lineWidth", 4);
  members.strokeRect.value(10, 20, 30, -40);
  assert.equal(rasterCalls.length, 1);
  const [{ path, state: drawState, mode }] = rasterCalls;
  assert.equal(mode, "stroke");
  assert.equal(drawState.lineWidth, 4);
  assert.deepEqual([...path.commands[0].args], [10, 20, 30, -40]);
  assert.deepEqual([...path.commands[0].transform], [2, 0, 0, 2, 5, 6]);
  assert.equal(ops[0].source, rasterCalls[0].source);
  assert.equal(rasterCalls[0].source.releases, 1);
});

test("an empty raster asset preserves the composite operation and releases its lease", () => {
  const { state, members, ops, rasterCalls } = setup({
    rasterBounds: { x: 0, y: 0, width: 0, height: 0 },
  });
  state.set("composite", "source-in");
  members.strokeRect.value(1000, 1000, 4, 4);
  assert.equal(rasterCalls.length, 1);
  assert.equal(ops.length, 1);
  assert.deepEqual(ops[0].source, { kind: "empty" });
  assert.equal(ops[0].state.composite, "source-in");
  assert.equal(rasterCalls[0].source.releases, 1);
});

test("the effective clip passes through to the operation unchanged", () => {
  const { state, members, ops } = setup();
  const clip = Object.freeze({
    id: 3,
    parent: null,
    path: Object.freeze({ id: 4, commands: Object.freeze([]) }),
    rule: "nonzero",
  });
  state.set("clip", clip);
  members.fillRect.value(0, 0, 4, 4);
  members.clearRect.value(0, 0, 4, 4);
  assert.equal(ops[0].clip, clip);
  assert.equal(ops[1].clip, clip);
});

test("a disposed device rejects; a lost device is silently ineffective", () => {
  const disposed = setup({ gpu: { status: "disposed" } });
  for (const name of ["fillRect", "clearRect", "strokeRect"])
    assert.throws(() => disposed.members[name].value(0, 0, 4, 4), {
      code: "disposed",
    });
  assert.equal(disposed.ops.length, 0);
  const lost = setup({ gpu: { status: "lost" } });
  lost.members.fillRect.value(0, 0, 4, 4);
  lost.members.clearRect.value(0, 0, 4, 4);
  lost.members.strokeRect.value(0, 0, 4, 4);
  assert.equal(lost.ops.length, 0);
  assert.equal(lost.rasterCalls.length, 0);
});

test("string and null arguments follow WebIDL double coercion", () => {
  const { members, ops } = setup();
  members.fillRect.value("1", "2", "3", "4");
  members.fillRect.value(null, null, 4, 4);
  assert.equal(ops.length, 2);
  assert.deepEqual(ops[0].source.bounds, { x: 1, y: 2, width: 3, height: 4 });
  assert.deepEqual(ops[1].source.bounds, { x: 0, y: 0, width: 4, height: 4 });
});
