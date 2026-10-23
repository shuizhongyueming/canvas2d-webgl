import test from "node:test";
import assert from "node:assert/strict";
import {
  MeasurementError,
  diffPixels,
  measurePixelDifference,
  normalizePixels,
} from "../../../dist/live/measure/diff-core.js";
import {
  formatChangedRatio,
  serializeFailedFeedback,
  serializeMeasuredFeedback,
} from "../../../dist/live/measure/feedback.js";

const pixels = (width, height, fill = 0) => {
  const data = new Uint8Array(width * height * 4);
  if (fill) data.fill(fill);
  return { width, height, pixels: data };
};
const setPixel = (target, x, y, rgba) =>
  target.pixels.set(rgba, (y * target.width + x) * 4);

// 决议 #64 验证样例 1：完全一致。
test("identical inputs measure zero difference with no bounds and a clear image", () => {
  const a = pixels(4, 3, 7);
  const b = pixels(4, 3, 7);
  const outcome = measurePixelDifference(a, b);
  assert.equal(outcome.status, "measured");
  assert.deepEqual(outcome.metrics, {
    totalPixels: 12,
    changedPixels: 0,
    changedRatio: 0,
    maxChannelDelta: 0,
    differenceBounds: null,
  });
  const { image } = diffPixels(normalizePixels(a), normalizePixels(b));
  assert.ok(image.every((value) => value === 0));
});

// 决议 #64 验证样例 2：10×10 单像素差 1。
test("a single channel unit difference is counted and localized exactly", () => {
  const a = pixels(10, 10);
  const b = pixels(10, 10);
  a.pixels.fill(255, 3, 100 * 4);
  b.pixels.fill(255, 3, 100 * 4);
  b.pixels[(4 * 10 + 3) * 4] = 254;
  const outcome = measurePixelDifference(a, b);
  assert.equal(outcome.status, "measured");
  assert.equal(outcome.metrics.changedPixels, 1);
  assert.equal(outcome.metrics.totalPixels, 100);
  assert.equal(outcome.metrics.changedRatio, 0.01);
  assert.equal(outcome.metrics.maxChannelDelta, 1);
  assert.deepEqual(outcome.metrics.differenceBounds, {
    x: 3,
    y: 4,
    width: 1,
    height: 1,
  });
});

// 决议 #64 验证样例 3：仅 alpha 不同必须计差异，且 alpha 计入 maxChannelDelta。
test("alpha-only differences count and contribute to maxChannelDelta", () => {
  const a = pixels(2, 1);
  const b = pixels(2, 1);
  setPixel(a, 1, 0, [9, 9, 9, 200]);
  setPixel(b, 1, 0, [9, 9, 9, 250]);
  const { metrics } = measurePixelDifference(a, b);
  assert.equal(metrics.changedPixels, 1);
  assert.equal(metrics.maxChannelDelta, 50);
});

// 决议 #64 验证样例 4：alpha=0 的 RGB 残色规范化后无差异；低 alpha 差异保留。
test("transparent residue normalizes away but low-alpha differences stay", () => {
  const a = pixels(2, 1);
  const b = pixels(2, 1);
  setPixel(a, 0, 0, [255, 128, 0, 0]);
  setPixel(b, 0, 0, [0, 64, 255, 0]);
  setPixel(a, 1, 0, [10, 20, 30, 8]);
  setPixel(b, 1, 0, [15, 20, 30, 8]);
  const { metrics } = measurePixelDifference(a, b);
  assert.equal(metrics.changedPixels, 1);
  assert.equal(metrics.maxChannelDelta, 5);
  assert.deepEqual(metrics.differenceBounds, {
    x: 1,
    y: 0,
    width: 1,
    height: 1,
  });
});

// 决议 #64：规范化不修改输入缓冲区。
test("normalization and measurement never mutate the caller buffers", () => {
  const a = pixels(2, 1);
  const b = pixels(2, 1);
  setPixel(a, 0, 0, [255, 0, 0, 0]);
  setPixel(b, 0, 0, [1, 2, 3, 0]);
  const snapshotA = new Uint8Array(a.pixels);
  const snapshotB = new Uint8Array(b.pixels);
  const normalized = normalizePixels(a);
  assert.deepEqual([...normalized.pixels], [0, 0, 0, 0, 0, 0, 0, 0]);
  measurePixelDifference(a, b);
  diffPixels(normalizePixels(a), normalizePixels(b));
  assert.deepEqual(a.pixels, snapshotA);
  assert.deepEqual(b.pixels, snapshotB);
});

// 决议 #64 验证样例 6：两个离散点的 bbox 包含二者，中间相同像素不计差异。
test("two separated points give a spanning bounds without counting the middle", () => {
  const a = pixels(10, 10, 200);
  const b = pixels(10, 10, 200);
  setPixel(b, 2, 3, [201, 200, 200, 200]);
  setPixel(b, 8, 7, [200, 199, 200, 200]);
  const { metrics } = measurePixelDifference(a, b);
  assert.equal(metrics.changedPixels, 2);
  assert.deepEqual(metrics.differenceBounds, {
    x: 2,
    y: 3,
    width: 7,
    height: 5,
  });
});

// 差异图为二值定位图：差异像素 [255,0,180,255]，相同像素全透明。
test("the difference image is binary purple on transparent", () => {
  const a = pixels(4, 1);
  const b = pixels(4, 1);
  setPixel(b, 2, 0, [0, 0, 1, 255]);
  const { image } = diffPixels(normalizePixels(a), normalizePixels(b));
  assert.deepEqual(
    [...image],
    [0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 180, 255, 0, 0, 0, 0],
  );
});

// 无效输入：尺寸不同、零尺寸、长度不符、非整数尺寸均返回可归因的 invalid。
test("invalid inputs report attributable reasons without metrics", () => {
  assert.deepEqual(measurePixelDifference(pixels(2, 2), pixels(3, 2)), {
    status: "invalid",
    reason: "size-mismatch",
  });
  assert.deepEqual(measurePixelDifference(pixels(0, 2), pixels(0, 2)), {
    status: "invalid",
    reason: "zero-size",
  });
  const short = { width: 2, height: 2, pixels: new Uint8Array(15) };
  assert.deepEqual(measurePixelDifference(short, pixels(2, 2)), {
    status: "invalid",
    reason: "incomplete-data",
  });
  const fractional = { width: 1.5, height: 2, pixels: new Uint8Array(12) };
  assert.deepEqual(measurePixelDifference(fractional, pixels(1, 2)), {
    status: "invalid",
    reason: "invalid-format",
  });
});

// diffPixels 对尺寸不一致抛可归因的 MeasurementError，不静默缩放或补齐。
test("diffPixels throws an attributable error for mismatched sizes", () => {
  const a = normalizePixels(pixels(2, 2));
  const b = normalizePixels(pixels(2, 3));
  assert.throws(
    () => diffPixels(a, b),
    (error) => {
      assert.ok(error instanceof MeasurementError);
      assert.equal(error.reason, "size-mismatch");
      return true;
    },
  );
});

// 决议 #64 验证样例 8：有效全透明输入与无有效像素区分——全透明零差异。
test("fully transparent but valid input measures as zero difference", () => {
  const a = pixels(3, 3); // 全 alpha=0
  const b = pixels(3, 3);
  const outcome = measurePixelDifference(a, b);
  assert.equal(outcome.status, "measured");
  assert.equal(outcome.metrics.changedPixels, 0);
  assert.equal(outcome.metrics.totalPixels, 9);
});

// 决议 #64 验证样例 9：同一输入重复量测结果一致（显示设置不改变量测输入）。
test("measurement is deterministic across repeated calls", () => {
  const a = pixels(5, 5, 128);
  const b = pixels(5, 5, 128);
  setPixel(b, 4, 4, [128, 128, 128, 127]);
  const first = measurePixelDifference(a, b);
  const second = measurePixelDifference(a, b);
  assert.deepEqual(first, second);
});

// 微小读回扰动如实计数，不被吞掉（不自动忽略 ±1）。
test("one-unit readback noise is counted, not suppressed", () => {
  const a = pixels(2, 2, 100);
  const b = pixels(2, 2, 100);
  b.pixels[0] = 101;
  const { metrics } = measurePixelDifference(a, b);
  assert.equal(metrics.changedPixels, 1);
  assert.equal(metrics.maxChannelDelta, 1);
});

// 反馈序列化：成功字段集合严格为冻结契约。
test("measured feedback contains exactly the frozen whitelist", () => {
  const report = serializeMeasuredFeedback({
    caseId: "example.case",
    browser: { userAgent: "ua", language: "zh-CN", devicePixelRatio: 2 },
    metrics: {
      totalPixels: 100,
      changedPixels: 1,
      changedRatio: 0.01,
      maxChannelDelta: 1,
      differenceBounds: { x: 2, y: 3, width: 1, height: 1 },
    },
    nativeSize: { width: 10, height: 10 },
    compatSize: { width: 10, height: 10 },
  });
  assert.deepEqual(Object.keys(report).sort(), [
    "browser",
    "caseId",
    "difference",
  ]);
  assert.deepEqual(Object.keys(report.browser).sort(), [
    "devicePixelRatio",
    "fingerprintingProtection",
    "language",
    "userAgent",
  ]);
  assert.equal(report.browser.fingerprintingProtection, "not-tested");
  assert.deepEqual(Object.keys(report.difference).sort(), [
    "changedPixels",
    "changedRatio",
    "compatSize",
    "differenceBounds",
    "maxChannelDelta",
    "nativeSize",
    "protocolVersion",
    "status",
    "totalPixels",
  ]);
  assert.equal(report.difference.status, "measured");
  const serialized = JSON.parse(JSON.stringify(report));
  assert.equal(serialized.difference.changedRatio, 0.01);
});

// 反馈序列化：失败只保留 protocolVersion/status/side/stage/reason，无数值指标。
test("failed feedback carries no numeric metrics", () => {
  const report = serializeFailedFeedback({
    caseId: "example.case",
    browser: { userAgent: "ua", language: "en", devicePixelRatio: 1 },
    side: null,
    stage: "running",
    reason: "size-mismatch",
  });
  assert.deepEqual(Object.keys(report).sort(), [
    "browser",
    "caseId",
    "difference",
  ]);
  assert.deepEqual(Object.keys(report.difference).sort(), [
    "protocolVersion",
    "reason",
    "side",
    "stage",
    "status",
  ]);
  assert.equal(report.difference.status, "failed");
  assert.equal(report.difference.side, null);
  const text = JSON.stringify(report);
  for (const forbidden of [
    "changedPixels",
    "changedRatio",
    "maxChannelDelta",
    "differenceBounds",
    "pixels",
    "screenshot",
    "commit",
    "dirty",
  ])
    assert.ok(
      !text.includes(forbidden),
      `forbidden field leaked: ${forbidden}`,
    );
});

// 格式化：非零比例不得显示成零。
test("formatChangedRatio never rounds a nonzero ratio to zero", () => {
  assert.equal(formatChangedRatio(0), "0%");
  assert.equal(formatChangedRatio(1), "100.00%");
  assert.equal(formatChangedRatio(0.01), "1.00%");
  assert.equal(formatChangedRatio(1 / 100000), "0.0010%");
  assert.equal(formatChangedRatio(1 / 10000000), "0.000010%");
  assert.equal(formatChangedRatio(1 / 100000000000), "<0.0001%");
  assert.equal(formatChangedRatio(0.5), "50.00%");
  assert.throws(() => formatChangedRatio(-0.1), RangeError);
  assert.throws(() => formatChangedRatio(1.1), RangeError);
  assert.throws(() => formatChangedRatio(Number.NaN), RangeError);
});
