import test from "node:test";
import assert from "node:assert/strict";
import {
  injectionPoints,
  isolatedInjection,
  measurePair,
} from "../../scripts/review-index.mjs";

const image = (width, height, pixels) => ({
  width,
  height,
  data: Buffer.from(pixels),
});

function solid(width, height, rgba) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return image(width, height, data);
}

test("an identical pair measures as zero difference without inventing a box", () => {
  const reference = solid(8, 6, [255, 0, 0, 255]);
  const actual = solid(8, 6, [255, 0, 0, 255]);
  assert.deepEqual(measurePair(reference, actual), {
    changed: 0,
    bounds: null,
    maxDelta: 0,
    edgeFlips: 0,
    lowAlphaDeltas: 0,
  });
});

test("the measurement separates rounding, coverage edges and low-alpha deltas", () => {
  const reference = solid(4, 2, [128, 0, 127, 255]);
  const actual = image(4, 2, Buffer.from(reference.data));
  // One channel unit: 8-bit rounding, not an edge.
  actual.data[0] = 129;
  // Alpha 0 on one side: a coverage flip.
  const edge = (1 * 4 + 0) * 4;
  actual.data[edge + 3] = 0;
  // Same low alpha on both sides: an antialiased-shade difference.
  const lowAlpha = (1 * 4 + 2) * 4;
  reference.data[lowAlpha + 3] = 8;
  actual.data[lowAlpha + 3] = 8;
  actual.data[lowAlpha] = reference.data[lowAlpha] + 5;
  const measured = measurePair(reference, actual);
  assert.equal(measured.changed, 3);
  assert.equal(measured.edgeFlips, 1);
  assert.equal(measured.lowAlphaDeltas, 1);
  // The coverage flip contributes a full alpha delta; the low-alpha shade is
  // counted separately rather than folded into the maximum.
  assert.equal(measured.maxDelta, 255);
  assert.deepEqual(measured.bounds, { x: 0, y: 0, width: 3, height: 2 });
});

test("the isolated-error counterexample locates every injected point exactly", () => {
  const reference = solid(16, 12, [10, 20, 30, 255]);
  const actual = solid(16, 12, [10, 20, 30, 255]);
  const points = injectionPoints(16, 12);
  assert.deepEqual(points, [
    [3, 3],
    [8, 6],
    [14, 9],
  ]);
  const located = isolatedInjection(reference, actual, points);
  assert.equal(located.injected, 3);
  assert.equal(located.reported, 3);
  assert.deepEqual(located.located, [
    [3, 3],
    [8, 6],
    [14, 9],
  ]);
  assert.equal(located.exact, true);
});

test("a single injected unit is never absorbed by a cleared channel", () => {
  // Channel 0 is already 255, so the injection wraps to 254 instead of a no-op.
  const reference = solid(4, 4, [255, 0, 0, 255]);
  const actual = solid(4, 4, [255, 0, 0, 255]);
  const located = isolatedInjection(reference, actual, [[1, 1]]);
  assert.equal(located.reported, 1);
  assert.equal(located.exact, true);
});
