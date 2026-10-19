import test from "node:test";
import assert from "node:assert/strict";
import { capture } from "./helpers.mjs";
import { paintFeature, defaultStylePaint, DEFAULT_STYLE_IDS } from "../../../dist/paint/index.js";

// Minimal StateStore double implementing the paint seam ("fill"/"stroke").
function stateDouble(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get: (name) => map.get(name),
    set: (name, value) => map.set(name, value),
    has: (name) => map.has(name),
  };
}
const make = (state) => {
  const feature = paintFeature({ state });
  const target = Object.create(null);
  Object.defineProperties(target, feature.members);
  return target;
};
const image = () => ({ complete: true, naturalWidth: 3, naturalHeight: 5 });

test("feature descriptor shape matches the context contract", () => {
  const feature = paintFeature({ state: stateDouble() });
  assert.equal(feature.id, "paint");
  const names = Object.keys(feature.members).sort();
  assert.deepEqual(names, [
    "createLinearGradient",
    "createPattern",
    "fillStyle",
    "strokeStyle",
  ]);
  assert.equal(typeof feature.members.createLinearGradient.value, "function");
  assert.equal(typeof feature.members.fillStyle.get, "function");
  assert.equal(typeof feature.members.fillStyle.set, "function");
});

test("fillStyle/strokeStyle parse, canonicalize and keep invalid input ignored", () => {
  const ctx = make(stateDouble());
  assert.equal(ctx.fillStyle, "#000000");
  assert.equal(ctx.strokeStyle, "#000000");
  ctx.fillStyle = "#AbCdEf";
  assert.equal(ctx.fillStyle, "#abcdef");
  ctx.fillStyle = "rgba(255,120,40,0.5)";
  assert.equal(ctx.fillStyle, "rgba(255, 120, 40, 0.5)");
  ctx.fillStyle = "not-a-color";
  assert.equal(ctx.fillStyle, "rgba(255, 120, 40, 0.5)", "invalid ignored");
  for (const junk of [null, undefined, 5, {}, []]) {
    ctx.fillStyle = junk;
    assert.equal(ctx.fillStyle, "rgba(255, 120, 40, 0.5)", String(junk));
  }
  assert.throws(() => {
    ctx.fillStyle = Symbol("x");
  }, TypeError);
  ctx.strokeStyle = "#010203";
  assert.equal(ctx.strokeStyle, "#010203");
  assert.equal(ctx.fillStyle, "rgba(255, 120, 40, 0.5)", "independent state keys");
});

test("legal but out-of-scope style values report unsupported-api", () => {
  const ctx = make(stateDouble());
  for (const value of ["red", "hsl(120,50%,50%)", "rgb(1 2 3 / 0.5)"]) {
    const error = capture(() => {
      ctx.fillStyle = value;
    });
    assert.equal(error.code, "unsupported-api", value);
    assert.equal(ctx.fillStyle, "#000000", "state unchanged after throw");
  }
});

test("gradient and pattern assignment keep object identity and live references", () => {
  const state = stateDouble();
  const ctx = make(state);
  const gradient = ctx.createLinearGradient(0, 0, 10, 0);
  gradient.addColorStop(0, "#ff0000");
  ctx.fillStyle = gradient;
  assert.equal(ctx.fillStyle, gradient);
  assert.equal(state.get("fill"), gradient, "the live object is stored");
  const pattern = ctx.createPattern(image(), "repeat");
  ctx.strokeStyle = pattern;
  assert.equal(ctx.strokeStyle, pattern);
  // A shared gradient observed through both styles sees one version counter.
  ctx.strokeStyle = gradient;
  gradient.addColorStop(1, "#0000ff");
  assert.equal(state.get("fill").version, 2);
  assert.equal(state.get("stroke").version, 2);
  assert.equal(state.get("fill"), state.get("stroke"));
});

test("createLinearGradient validates like native and records no transform", () => {
  const state = stateDouble();
  const ctx = make(state);
  assert.throws(() => ctx.createLinearGradient(), TypeError);
  assert.throws(() => ctx.createLinearGradient(0, 0, 1), TypeError);
  assert.throws(() => ctx.createLinearGradient(NaN, 0, 1, 1), TypeError);
  assert.throws(() => ctx.createLinearGradient(0, 0, Infinity, 1), TypeError);
  // WebIDL double conversion rejects BigInt with a plain TypeError.
  const bigint = capture(() => ctx.createLinearGradient(1n, 0, 1, 1));
  assert.equal(bigint.name, "TypeError");
  assert.equal(bigint.code, undefined, "not a DOMException");
  // Gradients evaluate in the draw-time space (issue #33), so creation reads
  // no transform from the state store: a state without a "transform" key is
  // sufficient and the snapshot carries user-space endpoints only.
  const g = ctx.createLinearGradient("1", "2", "3", "4");
  ctx.fillStyle = g;
  const paint = state.get("fill").snapshot();
  assert.deepEqual(paint.from, [1, 2], "string arguments coerce like WebIDL");
  assert.deepEqual(paint.to, [3, 4]);
  assert.equal("transform" in paint, false);
});

test("paint ids are unique within one canvas feature instance", () => {
  const state = stateDouble();
  const ctx = make(state);
  const seen = new Set();
  ctx.fillStyle = "#123456";
  seen.add(state.get("fill").id);
  ctx.fillStyle = ctx.createLinearGradient(0, 0, 1, 1);
  seen.add(state.get("fill").id);
  ctx.fillStyle = ctx.createPattern(image(), "repeat");
  seen.add(state.get("fill").id);
  ctx.fillStyle = "#654321";
  seen.add(state.get("fill").id);
  assert.equal(seen.size, 4);
  for (const id of seen) {
    assert.ok(
      id > DEFAULT_STYLE_IDS.stroke,
      `id ${id} stays above the reserved default-style ids`,
    );
  }
});

test("defaultStylePaint provides the matrix default", () => {
  const paint = defaultStylePaint(1);
  assert.equal(paint.publicValue, "#000000");
  assert.deepEqual(paint.snapshot(), { kind: "solid", color: [0, 0, 0, 1] });
});
