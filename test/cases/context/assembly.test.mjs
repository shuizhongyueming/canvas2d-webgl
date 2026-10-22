import test from "node:test";
import assert from "node:assert/strict";
import { createContext } from "../../../dist/context/context.js";
import { stateFeature } from "../../../dist/context/feature.js";
import { createStateStore } from "../../../dist/context/state.js";
import { PathRecorder } from "../../../dist/path/recorder.js";
import { createResourceOwner } from "../../../dist/resources/owner.js";
import { defaultStylePaint } from "../../../dist/paint/index.js";
import { rectFeature } from "../../../dist/features/rect/feature.js";
import { pathFeature } from "../../../dist/features/path/feature.js";
import { clipFeature } from "../../../dist/features/clip/feature.js";
import { textFeature } from "../../../dist/features/text/feature.js";
import { imageFeature } from "../../../dist/features/image/feature.js";
import { compositeFeature } from "../../../dist/features/composite/feature.js";
import { paintFeature } from "../../../dist/paint/index.js";

function stubRasterSource(bounds = { x: 0, y: 0, width: 8, height: 8 }) {
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

const allFeatures = [
  stateFeature,
  paintFeature,
  compositeFeature,
  rectFeature,
  pathFeature,
  clipFeature,
  textFeature,
  imageFeature,
];

/** The full real feature set over stub infrastructure services. */
function setup(overrides = {}) {
  const target = overrides.target ?? {
    width: 64,
    height: 64,
    getContext: () => null,
  };
  const gpu = {
    generation: 7,
    status: "active",
    draw(op) {
      ops.push(op);
    },
    ...overrides.gpu,
  };
  const ops = [];
  const pathCalls = [];
  const textCalls = [];
  const clipCalls = [];
  const measureCalls = [];
  const fontCalls = [];
  const raster = {
    path(path, drawState, mode) {
      const source = stubRasterSource(overrides.rasterBounds);
      pathCalls.push({ path, state: drawState, mode, source });
      return source;
    },
    text(text, x, y, drawState, mode) {
      const source = stubRasterSource(overrides.rasterBounds);
      textCalls.push({ text, x, y, state: drawState, mode, source });
      return source;
    },
    clip(path, rule, bounds) {
      clipCalls.push({ path, rule, bounds });
      return stubRasterSource(bounds);
    },
    measureWidth(text, drawState) {
      measureCalls.push({ text, state: drawState });
      return 42;
    },
    normalizeFont(candidate) {
      fontCalls.push(candidate);
      return candidate.trim();
    },
    clearCache() {},
  };
  const state = createStateStore({
    fill: defaultStylePaint(1),
    stroke: defaultStylePaint(2),
  });
  const path = new PathRecorder();
  const lifecycleRegistrations = [];
  const lifecycle = {
    register(hooks) {
      lifecycleRegistrations.push(hooks);
      return () => {};
    },
  };
  const environment = {
    target,
    state,
    path,
    raster,
    gpu,
    presenter: {},
    resources: createResourceOwner(),
    lifecycle,
    ...overrides.env,
  };
  const context = createContext(environment, allFeatures);
  return {
    context,
    state,
    path,
    gpu,
    ops,
    pathCalls,
    textCalls,
    clipCalls,
    measureCalls,
    fontCalls,
    lifecycleRegistrations,
    target,
    environment,
  };
}

test("the real feature set assembles into one context with the full public surface", () => {
  const { context } = setup();
  for (const name of [
    "fillStyle",
    "strokeStyle",
    "globalAlpha",
    "globalCompositeOperation",
    "lineWidth",
    "lineCap",
    "lineJoin",
    "font",
    "textAlign",
    "textBaseline",
    "filter",
    "save",
    "restore",
    "translate",
    "rotate",
    "scale",
    "setTransform",
    "drawImage",
    "fillRect",
    "clearRect",
    "strokeRect",
    "beginPath",
    "moveTo",
    "lineTo",
    "closePath",
    "arc",
    "arcTo",
    "quadraticCurveTo",
    "ellipse",
    "rect",
    "fill",
    "stroke",
    "clip",
    "fillText",
    "strokeText",
    "measureText",
    "createPattern",
    "createLinearGradient",
    "canvas",
  ]) {
    assert.ok(name in context, `${name} is installed`);
  }
  assert.equal(context.globalAlpha, 1);
  assert.equal(context.fillStyle, "#000000");
  assert.equal(context.strokeStyle, "#000000");
  assert.equal(context.lineJoin, "miter");
  assert.equal(context.textAlign, "start");
  assert.equal(context.textBaseline, "alphabetic");
  assert.equal(context.filter, "none");
});

test("supported members absent from the feature list stay not-implemented", () => {
  const { context } = setup();
  assert.throws(() => context.canvas, { code: "not-implemented" });
});

test("fillStyle assignment flows through the state store into rect draw operations", () => {
  const { context, ops } = setup();
  context.fillStyle = "#ff0000";
  context.fillRect(1, 2, 30, 40);
  assert.equal(ops.length, 1);
  assert.deepEqual(ops[0].source.paint, { kind: "solid", color: [1, 0, 0, 1] });
  assert.equal(ops[0].state.alpha, 1);
  assert.equal(ops[0].state.composite, "source-over");
  assert.equal(context.fillStyle, "#ff0000");
});

test("a gradient fill reaches the draw op with the draw-time transform preserved", () => {
  const { context, ops, pathCalls } = setup();
  const gradient = context.createLinearGradient(0, 0, 10, 0);
  gradient.addColorStop(0, "#ff0000");
  gradient.addColorStop(1, "#0000ff");
  context.fillStyle = gradient;
  context.translate(5, 5);
  context.fillRect(0, 0, 8, 8);
  assert.equal(pathCalls.length, 1);
  assert.equal(pathCalls[0].mode, "fill");
  assert.deepEqual([...pathCalls[0].path.commands[0].args], [0, 0, 8, 8]);
  assert.deepEqual(
    [...pathCalls[0].path.commands[0].transform],
    [1, 0, 0, 1, 5, 5],
  );
  assert.equal(ops[0].source, pathCalls[0].source);
  assert.equal(ops[0].state.fill.kind, "linear-gradient");
  assert.deepEqual(ops[0].state.fill.from, [0, 0]);
  assert.deepEqual(ops[0].state.fill.to, [10, 0]);
  assert.deepEqual([...ops[0].state.transform], [1, 0, 0, 1, 5, 5]);
  assert.equal(pathCalls[0].source.releases, 1);
});

test("clearRect submits a clear op that never consults the fill paint", () => {
  const { context, ops, pathCalls } = setup();
  context.fillStyle = "#ff0000";
  context.globalAlpha = 0.5;
  context.clearRect(4, 5, 6, 7);
  assert.equal(pathCalls.length, 0);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].kind, "clear");
  assert.equal(
    ops[0].state.alpha,
    0.5,
    "alpha stays in the snapshot; the paint stays inert",
  );
});

test("clip chains from the shared path and flows into later draw operations", () => {
  const { context, ops, state } = setup();
  context.beginPath();
  context.rect(2, 2, 10, 10);
  context.clip();
  const level = state.get("clip");
  assert.ok(level, "clip() stores the snapshot in the state store");
  assert.equal(level.rule, "nonzero");
  assert.ok(
    typeof level.mask === "function",
    "the mask provider defers to draw time",
  );
  context.fillRect(0, 0, 20, 20);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].clip, level);
  // clip() must not consume the path: the same path can fill afterwards.
  context.fill();
  assert.equal(ops.length, 2);
  assert.equal(ops[1].clip, level);
});

test("evenodd clip records the alternate rule", () => {
  const { context, state } = setup();
  context.beginPath();
  context.rect(0, 0, 4, 4);
  context.clip("evenodd");
  assert.equal(state.get("clip").rule, "evenodd");
});

test("save/restore round-trips transform, paint, alpha and clip across features", () => {
  const { context, ops, clipCalls } = setup();
  context.save();
  context.fillStyle = "#ff0000";
  context.globalAlpha = 0.5;
  context.translate(10, 20);
  context.beginPath();
  context.rect(0, 0, 5, 5);
  context.clip();
  const clipAfter = clipCalls.length;
  context.restore();
  assert.equal(context.fillStyle, "#000000");
  assert.equal(context.globalAlpha, 1);
  context.fillRect(0, 0, 4, 4);
  assert.deepEqual([...ops[0].source.transform], [1, 0, 0, 1, 0, 0]);
  assert.deepEqual(ops[0].source.paint, { kind: "solid", color: [0, 0, 0, 1] });
  assert.equal(ops[0].clip, null, "restore drops the clip reference");
  assert.equal(clipCalls.length, clipAfter);
});

test("fill uses the shared path captured before stroke-style state changes", () => {
  const { context, ops, pathCalls } = setup();
  context.translate(3, 4);
  context.beginPath();
  context.moveTo(1, 1);
  context.lineTo(5, 5);
  context.closePath();
  context.lineWidth = 3;
  context.strokeStyle = "#00ff00";
  context.stroke();
  assert.equal(pathCalls.length, 1);
  assert.equal(pathCalls[0].mode, "stroke");
  assert.equal(pathCalls[0].state.lineWidth, 3);
  assert.deepEqual(pathCalls[0].state.stroke, {
    kind: "solid",
    color: [0, 1, 0, 1],
  });
  assert.deepEqual(
    [...pathCalls[0].path.commands[0].transform],
    [1, 0, 0, 1, 3, 4],
  );
  assert.equal(ops.length, 1);
  assert.equal(pathCalls[0].source.releases, 1);
});

test("fill with no constructed path is a no-op across the whole chain", () => {
  const { context, ops, pathCalls } = setup();
  context.fill();
  context.stroke();
  assert.equal(ops.length, 0);
  assert.equal(pathCalls.length, 0);
});

test("text draws snapshot the full draw state including font and align", () => {
  const { context, ops, textCalls } = setup();
  context.font = "12px serif";
  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillText("hi", 3, 4);
  assert.equal(textCalls.length, 1);
  assert.equal(textCalls[0].text, "hi");
  assert.equal(textCalls[0].state.font, "12px serif");
  assert.equal(textCalls[0].state.textAlign, "center");
  assert.equal(textCalls[0].state.textBaseline, "top");
  assert.equal(ops.length, 1);
  assert.equal(textCalls[0].source.releases, 1);
  const metrics = context.measureText("hi");
  assert.equal(metrics.width, 42);
});

test("measureText reports unsupported metrics members and a fresh object per call", () => {
  const { context } = setup();
  const first = context.measureText("a");
  const second = context.measureText("a");
  assert.notEqual(first, second);
  assert.throws(() => first.actualBoundingBoxLeft, { code: "unsupported-api" });
});

test("drawImage from a native canvas source submits an upload-backed draw op", () => {
  const { context, ops, target } = setup();
  const source = {
    width: 4,
    height: 4,
    getContext: (type) =>
      type === "2d"
        ? {
            drawImage() {},
            getImageData: (x, y, w, h) => ({
              data: new Uint8ClampedArray(w * h * 4),
            }),
          }
        : null,
  };
  // The brand lives on the prototype chain, not as an own property.
  Object.defineProperty(Object.getPrototypeOf(source), Symbol.toStringTag, {
    value: "HTMLCanvasElement",
  });
  context.drawImage(source, 1, 2);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].kind, "draw");
  assert.ok(ops[0].source, "the upload-backed source reaches the op");
  // The caller's own target stays rejected (IMG-03).
  assert.throws(() => context.drawImage(target, 0, 0), {
    code: "unsupported-api",
  });
  assert.throws(() => context.drawImage(0, 0, 4, 4), TypeError);
});

test("globalCompositeOperation and filter land in every draw snapshot", () => {
  const { context, ops } = setup();
  context.globalCompositeOperation = "lighter";
  context.filter = "brightness(120%)";
  context.fillRect(0, 0, 4, 4);
  assert.equal(ops[0].state.composite, "lighter");
  assert.equal(ops[0].state.filter, "brightness(120%)");
  // Spec-recognized but out-of-scope spellings are reported, value kept.
  assert.throws(
    () => {
      context.globalCompositeOperation = "copy";
    },
    { code: "unsupported-api" },
  );
  assert.equal(context.globalCompositeOperation, "lighter");
  // Unrecognized spellings are silently ignored like native.
  context.globalCompositeOperation = "nonsense";
  assert.equal(context.globalCompositeOperation, "lighter");
});

test("a disposed device rejects draws; a lost device is silently ineffective", () => {
  const disposed = setup({ gpu: { status: "disposed" } });
  assert.throws(() => disposed.context.fillRect(0, 0, 4, 4), {
    code: "disposed",
  });
  assert.throws(() => disposed.context.fill(), { code: "disposed" });
  assert.throws(() => disposed.context.fillText("a", 0, 0), {
    code: "disposed",
  });
  assert.equal(disposed.ops.length, 0);
  const lost = setup({ gpu: { status: "lost" } });
  lost.context.fillRect(0, 0, 4, 4);
  lost.context.fillText("a", 0, 0);
  assert.equal(lost.ops.length, 0);
  assert.equal(lost.pathCalls.length, 0);
  assert.equal(lost.textCalls.length, 0);
});

test("unsupported-api routing holds for the excluded read-back and legacy overloads", () => {
  const { context } = setup();
  assert.throws(() => context.getImageData(0, 0, 1, 1), {
    code: "unsupported-api",
  });
  assert.throws(() => context.setLineDash([1]), { code: "unsupported-api" });
  assert.throws(() => context.setTransform(), { code: "unsupported-api" });
  // Extra rect arguments are ignored like native; missing ones throw counted.
  assert.throws(() => context.strokeRect(0, 0, 4), TypeError);
  // measureText with a missing argument throws the counted native TypeError.
  assert.throws(() => context.measureText(), TypeError);
});

test("strokeRect with a non-solid stroke rasterizes through the shared path service", () => {
  const { context, ops, pathCalls } = setup();
  const gradient = context.createLinearGradient(0, 0, 10, 0);
  gradient.addColorStop(0, "#ffffff");
  context.strokeStyle = gradient;
  context.strokeRect(1, 2, 3, 4);
  assert.equal(pathCalls.length, 1);
  assert.equal(pathCalls[0].mode, "stroke");
  assert.equal(pathCalls[0].path.commands[0].op, "rect");
  assert.equal(ops[0].source, pathCalls[0].source);
  assert.equal(pathCalls[0].source.releases, 1);
});

test("disposed is reported before argument conversion or a no-op decision", () => {
  const { context, gpu } = setup();
  gpu.status = "disposed";
  const disposed = (fn) => assert.throws(fn, { code: "disposed" });
  disposed(() => context.save());
  disposed(() => context.restore());
  disposed(() => context.beginPath());
  disposed(() => context.fillStyle);
  disposed(() => {
    context.fillStyle = "#ff0000";
  });
  disposed(() => context.createLinearGradient(0, 0, 1, 1));
  disposed(() => context.measureText("x"));
  // Valid geometry and geometry that would otherwise be silently ignored both
  // report the disposal: the assembly layer runs the guard first.
  disposed(() => context.fillRect(0, 0, 10, 10));
  disposed(() => context.fillRect(NaN, 0, 10, 10));
  disposed(() => context.fillRect(0, 0, 0, 0));
  // Argument-count errors do not win over disposal either.
  disposed(() => context.fillRect(0, 0));
});

test("the disposal guard keeps each member's declared arity", () => {
  const { context } = setup();
  // A declared-parameter signature keeps its count through the wrapper...
  assert.equal(context.createLinearGradient.length, 4);
  // ...and a rest-parameter signature keeps its zero, exactly as the feature
  // declares it; the guard never manufactures arity.
  assert.equal(context.save.length, 0);
  assert.equal(context.fillRect.length, 0);
});
