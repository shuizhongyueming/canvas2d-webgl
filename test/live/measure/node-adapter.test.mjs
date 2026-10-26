import test from "node:test";
import assert from "node:assert/strict";
import { MeasurementError, diffPixels, normalizePixels } from "./node.mjs";
// 旧 harness 入口保持同一语义：尺寸不符仍抛 "Image dimensions differ"，
// 返回形状保持 { width, height, data, changedPixels, bounds }。
import { diffPixels as legacyDiffPixels } from "../../harness/evidence.mjs";

const image = (width, height, fill = 0) => {
  const data = Buffer.alloc(width * height * 4);
  if (fill) data.fill(fill);
  return { width, height, data };
};

test("node adapter preserves the legacy evidence.diffPixels shape", () => {
  const a = image(4, 2, 10);
  const b = image(4, 2, 10);
  b.data[(1 * 4 + 2) * 4] = 11;
  const diff = diffPixels(a, b);
  assert.equal(diff.width, 4);
  assert.equal(diff.height, 2);
  assert.ok(Buffer.isBuffer(diff.data));
  assert.equal(diff.changedPixels, 1);
  assert.deepEqual(diff.bounds, { x: 2, y: 1, width: 1, height: 1 });
  assert.equal(diff.maxChannelDelta, 1);
  assert.equal(diff.totalPixels, 8);
  assert.equal(diff.changedRatio, 1 / 8);
  // 差异图二值紫；与旧实现一致。
  assert.deepEqual(
    [...diff.data.subarray((1 * 4 + 2) * 4, (1 * 4 + 2) * 4 + 4)],
    [255, 0, 180, 255],
  );
  assert.ok(diff.data.subarray(0, 8).every((v) => v === 0));
});

test("legacy evidence.diffPixels keeps its error contract and output", () => {
  const a = image(2, 2);
  const b = image(3, 2);
  assert.throws(() => legacyDiffPixels(a, b), /Image dimensions differ/);
  const c = image(2, 2);
  const d = image(2, 2);
  d.data[0] = 1;
  const diff = legacyDiffPixels(c, d);
  assert.equal(diff.changedPixels, 1);
  assert.deepEqual(diff.bounds, { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(diff.maxChannelDelta, undefined); // 旧形状不扩展新字段
});

test("node adapter surfaces attributable measurement errors", () => {
  assert.throws(
    () => diffPixels(image(2, 2), image(2, 3)),
    (error) => {
      assert.ok(error instanceof MeasurementError);
      assert.equal(error.reason, "size-mismatch");
      return true;
    },
  );
});

test("normalizePixels returns a zeroed-RGB copy without mutating input", () => {
  const a = image(1, 1);
  a.data.set([9, 8, 7, 0]);
  const normalized = normalizePixels(a);
  assert.deepEqual([...normalized.data], [0, 0, 0, 0]);
  assert.deepEqual([...a.data], [9, 8, 7, 0]);
});

test("node adapter accepts Uint8ClampedArray and generic typed views", () => {
  const a = { width: 2, height: 1, data: new Uint8ClampedArray(8) };
  const b = { width: 2, height: 1, data: new Uint8ClampedArray(8) };
  b.data[4] = 3;
  const diff = diffPixels(a, b);
  assert.equal(diff.changedPixels, 1);
  assert.equal(diff.maxChannelDelta, 3);
});
