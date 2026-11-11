import test from "node:test";
import assert from "node:assert/strict";
import {
  benchmarkResult,
  passesBenchmark,
} from "../../scripts/benchmark-result.mjs";
const sample = { frames: [100, 100, 100], elapsed: 300, dpr: 2, hidden: false };
test("adapter fields cannot overwrite measured FPS or bypass a renderer mismatch", () => {
  const result = benchmarkResult(
    "webgl",
    sample,
    {
      mode: "native",
      fps: 60,
      elapsed: 50,
      frameMs: { p95: 1 },
      gpu: "Metal",
      activityRatio: 1,
    },
    [],
    [],
    30,
  );
  assert.equal(result.mode, "webgl");
  assert.equal(result.actualMode, "native");
  assert.equal(result.fps, 10);
  assert.equal(result.elapsed, 300);
  assert.equal(result.frameMs.p95, 100);
  assert.equal(passesBenchmark([result]), false);
});
test("hardware and frame budgets stay independent from reported adapter verdicts", () => {
  const fast = { ...sample, frames: [16.7, 16.7, 16.7], elapsed: 50.1 };
  const make = (gpu) =>
    benchmarkResult(
      "webgl",
      fast,
      { actualMode: "webgl", gpu, activityRatio: 1, meetsAverageTarget: false },
      [],
      [],
      30,
    );
  assert.equal(passesBenchmark([make("Metal")]), true);
  assert.equal(passesBenchmark([make("SwiftShader")]), false);
  assert.equal(passesBenchmark([]), false);
});
