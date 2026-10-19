import test from "node:test";
import assert from "node:assert/strict";
import { capture } from "./helpers.mjs";
import { LinearGradientPaint, isCompatGradient } from "../../../dist/paint/gradient.js";

const make = () => new LinearGradientPaint(1, [0, 0], [10, 0]);

test("addColorStop keeps native exception types", () => {
  const g = make();
  for (const offset of [-0.1, 1.1, 2]) {
    const error = capture(() => g.addColorStop(offset, "#fff"));
    assert.equal(error.name, "IndexSizeError");
    assert.equal(error.code, 1);
  }
  for (const offset of [NaN, Infinity, -Infinity, "abc"]) {
    const error = capture(() => g.addColorStop(offset, "#fff"));
    assert.equal(error.name, "TypeError");
  }
  // WebIDL double conversion rejects BigInt with a plain TypeError.
  const bigint = capture(() => g.addColorStop(1n, "#fff"));
  assert.equal(bigint.name, "TypeError");
  assert.equal(bigint.code, undefined, "not a DOMException");
  // BigInt colors stringify per WebIDL and then fail as colors.
  const bigintColor = capture(() => g.addColorStop(0.5, 1n));
  assert.equal(bigintColor.name, "SyntaxError");
  for (const color of ["not-a-color", "", null]) {
    const error = capture(() => g.addColorStop(0.5, color));
    assert.equal(error.name, "SyntaxError");
    assert.equal(error.code, 12);
  }
  assert.throws(() => g.addColorStop(0.5), TypeError);
  assert.throws(() => g.addColorStop(), TypeError);
  // Coercions follow WebIDL: string offsets and extra arguments are fine.
  g.addColorStop("0.5", "#fff");
  g.addColorStop(0.25, "#000", "extra");
});

test("legal but out-of-scope stop colors report unsupported-api", () => {
  const g = make();
  const error = capture(() => g.addColorStop(0.5, "red"));
  assert.equal(error.code, "unsupported-api");
  assert.equal(g.version, 0, "failed stop must not bump the version");
});

test("stops snapshot sorted with stable duplicate order", () => {
  const g = new LinearGradientPaint(7, [0, 0], [100, 0]);
  g.addColorStop(1, "#0000ff");
  g.addColorStop(0, "#ff0000");
  g.addColorStop(0.5, "#00ff00");
  g.addColorStop(0.5, "#123456");
  assert.equal(g.version, 4);
  const paint = g.snapshot();
  assert.equal(paint.kind, "linear-gradient");
  assert.equal(paint.id, 7);
  assert.equal(paint.version, 4);
  assert.deepEqual(paint.from, [0, 0]);
  assert.deepEqual(paint.to, [100, 0]);
  assert.equal(
    "transform" in paint,
    false,
    "no creation-time transform is recorded (issue #33)",
  );
  const offsets = paint.stops.map((stop) => stop.offset);
  assert.deepEqual(offsets, [0, 0.5, 0.5, 1]);
  assert.deepEqual(
    paint.stops[1].color.map((c) => Math.round(c * 255)),
    [0, 255, 0, 255],
  );
  assert.deepEqual(
    paint.stops[2].color.map((c) => Math.round(c * 255)),
    [18, 52, 86, 255],
  );
  assert.ok(Object.isFrozen(paint));
  assert.ok(Object.isFrozen(paint.stops));
  assert.ok(Object.isFrozen(paint.stops[0]));
});

test("snapshots are isolated from later addColorStop calls", () => {
  const g = make();
  g.addColorStop(0, "#ff0000");
  const before = g.snapshot();
  g.addColorStop(1, "#0000ff");
  assert.equal(before.version, 1);
  assert.equal(before.stops.length, 1);
  const after = g.snapshot();
  assert.equal(after.version, 2);
  assert.equal(after.stops.length, 2);
});

test("zero-length gradients and empty stop lists are preserved as data", () => {
  const empty = make().snapshot();
  assert.equal(empty.stops.length, 0);
  const degenerate = new LinearGradientPaint(2, [5, 5], [5, 5]);
  degenerate.addColorStop(0.5, "#336699");
  const paint = degenerate.snapshot();
  assert.deepEqual(paint.from, [5, 5]);
  assert.deepEqual(paint.to, [5, 5]);
  assert.equal(paint.stops.length, 1);
});

test("gradient identity is recognized, foreign objects are not", () => {
  const g = make();
  assert.ok(isCompatGradient(g));
  assert.ok(isCompatGradient(g.publicValue));
  assert.ok(!isCompatGradient({ addColorStop() {} }));
  assert.ok(!isCompatGradient(null));
  assert.ok(!isCompatGradient("gradient"));
});
