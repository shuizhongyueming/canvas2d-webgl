import test from "node:test";
import assert from "node:assert/strict";
import { imageFeature } from "../../../dist/features/image/feature.js";
import { createFacade } from "../../../dist/canvas/facade.js";
import { createStateStore } from "../../../dist/context/state.js";

// DOM brands are forged with an inherited Symbol.toStringTag, the same
// cross-realm brand channel the classifier trusts (a genuine DOM wrapper keeps
// the tag on its interface prototype); Node has no HTMLImageElement constructor.
function branded(tag) {
  return Object.create({ [Symbol.toStringTag]: tag });
}

function fakeImage(overrides = {}) {
  return Object.assign(branded("HTMLImageElement"), {
    complete: true,
    naturalWidth: 4,
    naturalHeight: 3,
    currentSrc: "data:image/png;base64,x",
    src: "data:image/png;base64,x",
    ...overrides,
  });
}

function fakeCanvas(overrides = {}) {
  return Object.assign(branded("HTMLCanvasElement"), {
    width: 4,
    height: 3,
    ...overrides,
  });
}

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
  const target = { width: 16, height: 16 };
  const env = { state, gpu, target, ...overrides.env };
  const feature = imageFeature(env);
  assert.equal(feature.id, "image");
  return {
    state,
    gpu,
    ops,
    target,
    drawImage: feature.members.drawImage.value,
  };
}

function compatFacade(target) {
  return createFacade(
    target,
    { disposed: false },
    { width: target.width, height: target.height },
    {},
  );
}

test("the factory requires state, gpu and target in the environment", () => {
  assert.throws(() => imageFeature({}), { code: "contract-violation" });
  const state = createStateStore({ fill: stubPaint(1), stroke: stubPaint(2) });
  assert.throws(() => imageFeature({ state, gpu: {} }), {
    code: "contract-violation",
  });
});

test("arity: below 3 throws the counted TypeError; 4/6/7/8 fail overload resolution", () => {
  const { drawImage, ops } = setup();
  const image = fakeImage();
  for (const count of [0, 1, 2])
    assert.throws(
      () => drawImage(...[image, 0, 0].slice(0, count)),
      (error) =>
        error instanceof TypeError &&
        error.message ===
          `Failed to execute 'drawImage' on 'CanvasRenderingContext2D': 3 arguments required, but only ${count} present.`,
    );
  for (const args of [
    [image, 0, 0, 1],
    [image, 0, 0, 4, 3, 0],
    [image, 0, 0, 4, 3, 0, 0],
    [image, 0, 0, 4, 3, 0, 0, 0],
  ])
    assert.throws(
      () => drawImage(...args),
      (error) =>
        error instanceof TypeError &&
        error.message ===
          "Failed to execute 'drawImage' on 'CanvasRenderingContext2D': Overload resolution failed.",
    );
  assert.equal(ops.length, 0);
});

test("values that are not image sources reject with the native TypeError", () => {
  const { drawImage, ops } = setup();
  for (const bad of [
    42,
    "x",
    null,
    undefined,
    {},
    { width: 4, height: 3 },
    { [Symbol.toStringTag]: "ImageData" },
  ])
    assert.throws(() => drawImage(bad, 0, 0), TypeError);
  // An own Symbol.toStringTag is a forged plain object, not a DOM wrapper.
  for (const tag of [
    "HTMLImageElement",
    "HTMLCanvasElement",
    "OffscreenCanvas",
  ])
    assert.throws(
      () => drawImage({ [Symbol.toStringTag]: tag }, 0, 0),
      TypeError,
    );
  assert.equal(ops.length, 0);
});

test("compat canvases, the own target and other native source kinds report unsupported-api", () => {
  const { drawImage, ops, target } = setup();
  assert.throws(() => drawImage(compatFacade(target), 0, 0), {
    code: "unsupported-api",
  });
  assert.throws(() => drawImage(target, 0, 0), { code: "unsupported-api" });
  const otherTarget = { width: 8, height: 8 };
  assert.throws(() => drawImage(compatFacade(otherTarget), 0, 0), {
    code: "unsupported-api",
  });
  for (const tag of ["ImageBitmap", "HTMLVideoElement", "VideoFrame"])
    assert.throws(() => drawImage(branded(tag), 0, 0), {
      code: "unsupported-api",
    });
  assert.equal(ops.length, 0);
});

test("the compat brand reaches facades created by another library copy", () => {
  const { drawImage, ops } = setup();
  const target = { width: 4, height: 4 };
  createFacade(target, { disposed: false }, { width: 4, height: 4 }, {});
  assert.equal(
    target[Symbol.for("canvas2d-webgl.compat-canvas")],
    true,
    "target carries the shared non-enumerable brand",
  );
  const foreign = new Proxy(target, {
    get: (source, key) => Reflect.get(source, key, source),
  });
  assert.throws(() => drawImage(foreign, 0, 0), { code: "unsupported-api" });
  assert.equal(ops.length, 0);
});

test("coordinate conversion precedes the unsupported-source report", () => {
  const { drawImage, target } = setup();
  assert.throws(() => drawImage(compatFacade(target), 0n, 0), TypeError);
  assert.throws(() => drawImage(target, 0, Symbol("s")), TypeError);
});

test("pending and source-less images draw nothing; a broken image throws InvalidStateError", () => {
  const { drawImage, ops } = setup();
  drawImage(
    fakeImage({ complete: false, naturalWidth: 0, naturalHeight: 0 }),
    0,
    0,
  );
  drawImage(
    fakeImage({ naturalWidth: 0, naturalHeight: 0, currentSrc: "", src: "" }),
    0,
    0,
  );
  assert.equal(ops.length, 0);
  assert.throws(
    () => drawImage(fakeImage({ naturalWidth: 0, naturalHeight: 0 }), 0, 0),
    (error) => error instanceof Error && error.name === "InvalidStateError",
  );
  assert.equal(ops.length, 0);
});

test("a zero-size canvas source throws InvalidStateError", () => {
  const { drawImage, ops } = setup();
  assert.throws(() => drawImage(fakeCanvas({ width: 0 }), 0, 0), {
    name: "InvalidStateError",
  });
  assert.throws(() => drawImage(fakeCanvas({ height: 0 }), 0, 0), {
    name: "InvalidStateError",
  });
  assert.equal(ops.length, 0);
});

test("non-finite coordinates are silently ignored; BigInt and Symbol reject", () => {
  const { drawImage, ops } = setup();
  const image = fakeImage();
  for (const bad of [NaN, Infinity, -Infinity, undefined]) {
    drawImage(image, bad, 0);
    drawImage(image, 0, 0, 4, bad);
    drawImage(image, 0, 0, 4, 3, 0, bad, 4, 3);
  }
  assert.equal(ops.length, 0);
  assert.throws(() => drawImage(image, 0n, 0), TypeError);
  assert.throws(() => drawImage(image, 0, 0, 4, Symbol("s")), TypeError);
  assert.equal(ops.length, 0);
});

test("zero extents are no-ops in every overload", () => {
  const { drawImage, ops } = setup();
  const image = fakeImage();
  drawImage(image, 0, 0, 0, 3);
  drawImage(image, 0, 0, 4, 0);
  drawImage(image, 0, 0, 0, 3, 0, 0, 4, 3);
  drawImage(image, 0, 0, 4, 0, 0, 0, 4, 3);
  drawImage(image, 0, 0, 4, 3, 0, 0, 0, 3);
  drawImage(image, 0, 0, 4, 3, 0, 0, 4, 0);
  assert.equal(ops.length, 0);
});

test("the 3-argument form fills source and destination from the intrinsic size", () => {
  const { drawImage, ops } = setup();
  const image = fakeImage();
  drawImage(image, 5, 6);
  assert.equal(ops.length, 1);
  const [op] = ops;
  assert.equal(op.kind, "draw");
  assert.equal(op.generation, 7);
  assert.equal(op.source.kind, "image");
  assert.equal(op.source.image, image);
  assert.deepEqual(op.source.sourceRect, { x: 0, y: 0, width: 4, height: 3 });
  assert.deepEqual(op.source.destinationRect, {
    x: 5,
    y: 6,
    width: 4,
    height: 3,
  });
  assert.deepEqual(op.sourceBounds, { x: 5, y: 6, width: 4, height: 3 });
  assert.equal(op.clip, null);
});

test("the 5-argument form scales the full source into dw/dh", () => {
  const { drawImage, ops } = setup();
  drawImage(fakeImage(), 5, 6, 8, 9);
  assert.deepEqual(ops[0].source.sourceRect, {
    x: 0,
    y: 0,
    width: 4,
    height: 3,
  });
  assert.deepEqual(ops[0].source.destinationRect, {
    x: 5,
    y: 6,
    width: 8,
    height: 9,
  });
});

test("the 9-argument form passes the source crop through; extras are ignored", () => {
  const { drawImage, ops } = setup();
  const image = fakeImage();
  drawImage(image, 1, 1, 2, 2, 10, 20, 6, 8);
  drawImage(image, 1, 1, 2, 2, 10, 20, 6, 8, "ignored", null);
  assert.equal(ops.length, 2);
  for (const op of ops) {
    assert.deepEqual(op.source.sourceRect, { x: 1, y: 1, width: 2, height: 2 });
    assert.deepEqual(op.source.destinationRect, {
      x: 10,
      y: 20,
      width: 6,
      height: 8,
    });
  }
});

test("out-of-bounds source rectangles clip proportionally on both rectangles", () => {
  const { drawImage, ops } = setup();
  drawImage(fakeImage(), -2, 0, 4, 3, 10, 0, 8, 6);
  assert.equal(ops.length, 1);
  // Source x from -2..2 clips to 0..2 (t 0.5..1); the destination follows.
  assert.deepEqual(ops[0].source.sourceRect, {
    x: 0,
    y: 0,
    width: 2,
    height: 3,
  });
  assert.deepEqual(ops[0].source.destinationRect, {
    x: 14,
    y: 0,
    width: 4,
    height: 6,
  });
  // Entirely outside: nothing is submitted.
  drawImage(fakeImage(), 10, 0, 2, 2, 0, 0, 4, 4);
  drawImage(fakeImage(), 0, -5, 2, 2, 0, 0, 4, 4);
  assert.equal(ops.length, 1);
});

test("negative spans extend backwards without mirroring pixels", () => {
  const { drawImage, ops } = setup();
  drawImage(fakeImage(), 4, 3, -4, -3, 20, 30, -8, -6);
  assert.equal(ops.length, 1);
  assert.deepEqual(ops[0].source.sourceRect, {
    x: 0,
    y: 0,
    width: 4,
    height: 3,
  });
  assert.deepEqual(ops[0].source.destinationRect, {
    x: 12,
    y: 24,
    width: 8,
    height: 6,
  });
  assert.deepEqual(ops[0].sourceBounds, { x: 12, y: 24, width: 8, height: 6 });
  drawImage(fakeImage(), 6, 0, -4, 3, 0, 0, 8, 3);
  assert.deepEqual(ops[1].source.sourceRect, {
    x: 2,
    y: 0,
    width: 2,
    height: 3,
  });
  assert.deepEqual(ops[1].source.destinationRect, {
    x: 0,
    y: 0,
    width: 4,
    height: 3,
  });
});

test("sourceBounds is the device-space hull under the draw transform", () => {
  const { state, drawImage, ops } = setup();
  state.set("transform", [1, 0, 0, 1, 10, 20]);
  drawImage(fakeImage(), 1, 2, 4, 3);
  assert.deepEqual(ops[0].sourceBounds, { x: 11, y: 22, width: 4, height: 3 });
  state.set("transform", [0, 1, -1, 0, 0, 0]); // quarter turn
  drawImage(fakeImage(), 10, 20, 4, 3);
  assert.deepEqual(ops[1].sourceBounds, { x: -23, y: 10, width: 3, height: 4 });
});

test("state snapshot, composite mode, alpha and clip flow into the operation", () => {
  const { state, drawImage, ops } = setup();
  const clip = Object.freeze({
    id: 3,
    parent: null,
    path: Object.freeze({ id: 4, commands: Object.freeze([]) }),
    rule: "nonzero",
  });
  state.set("alpha", 0.25);
  state.set("composite", "lighter");
  state.set("clip", clip);
  drawImage(fakeImage(), 0, 0);
  assert.equal(ops[0].state.alpha, 0.25);
  assert.equal(ops[0].state.composite, "lighter");
  assert.equal(ops[0].clip, clip);
});

test("canvas sources carry their element size as the intrinsic size", () => {
  const { drawImage, ops } = setup();
  const canvas = fakeCanvas({ width: 7, height: 5 });
  drawImage(canvas, 2, 3);
  assert.equal(ops[0].source.image, canvas);
  assert.deepEqual(ops[0].source.sourceRect, {
    x: 0,
    y: 0,
    width: 7,
    height: 5,
  });
});

test("coerced string and null coordinates follow WebIDL double conversion", () => {
  const { drawImage, ops } = setup();
  drawImage(fakeImage(), "5", null);
  assert.deepEqual(ops[0].source.destinationRect, {
    x: 5,
    y: 0,
    width: 4,
    height: 3,
  });
});

test("a disposed device rejects after validation; a lost device is silently ineffective", () => {
  const disposed = setup({ gpu: { status: "disposed" } });
  assert.throws(() => disposed.drawImage(fakeImage(), 0, 0), {
    code: "disposed",
  });
  assert.equal(disposed.ops.length, 0);
  const lost = setup({ gpu: { status: "lost" } });
  lost.drawImage(fakeImage(), 0, 0);
  lost.drawImage(fakeCanvas(), 0, 0, 4, 3, 0, 0, 4, 3);
  assert.equal(lost.ops.length, 0);
});

test("upload-boundary failures from the device propagate unchanged", () => {
  const gpu = {
    generation: 7,
    status: "active",
    draw() {
      const error = new Error(
        "resource-limit: source 9000x9000 exceeds MAX_TEXTURE_SIZE 4096",
      );
      error.code = "resource-limit";
      throw error;
    },
  };
  const { drawImage } = setup({ env: { gpu } });
  assert.throws(() => drawImage(fakeImage(), 0, 0), { code: "resource-limit" });
});
