/**
 * 浏览器回归（issue #68）：纯核心 dist/live 模块可在真实 Chromium 直接加载，
 * 并与 Node 在同一测试向量上得到一致结果。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { measurePixelDifference } from "../../../dist/live/measure/diff-core.js";

const root = fileURLToPath(new URL("../../..", import.meta.url));

// 固定测试向量：10×10，差异位于 (2,3) 差 1、纯 alpha 差异与 alpha=0 残色。
const buildVectors = () => {
  const native = new Uint8Array(400);
  const compat = new Uint8Array(400);
  // (2,3) 单通道差 1
  native[(3 * 10 + 2) * 4] = 128;
  compat[(3 * 10 + 2) * 4] = 129;
  native[(3 * 10 + 2) * 4 + 3] = 10;
  compat[(3 * 10 + 2) * 4 + 3] = 10;
  // (5,5) 仅 alpha 不同
  native[(5 * 10 + 5) * 4 + 3] = 200;
  compat[(5 * 10 + 5) * 4 + 3] = 201;
  // (7,8) 两侧 alpha=0、RGB 残色不同：规范化后无差异
  native[(8 * 10 + 7) * 4] = 255;
  compat[(8 * 10 + 7) * 4 + 1] = 255;
  return {
    native: [...native],
    compat: [...compat],
    width: 10,
    height: 10,
  };
};

const expectedMetrics = {
  totalPixels: 100,
  changedPixels: 2,
  changedRatio: 0.02,
  maxChannelDelta: 1,
  differenceBounds: { x: 2, y: 3, width: 4, height: 3 },
};

test("node baseline on the shared vectors", () => {
  const v = buildVectors();
  const outcome = measurePixelDifference(
    { width: v.width, height: v.height, pixels: new Uint8Array(v.native) },
    { width: v.width, height: v.height, pixels: new Uint8Array(v.compat) },
  );
  assert.equal(outcome.status, "measured");
  assert.deepEqual(outcome.metrics, expectedMetrics);
});

test("the pure core loads in Chromium and matches Node on the same vectors", async () => {
  const moduleUrl = `file://${root}/dist/live/measure/diff-core.js`;
  const contractsUrl = `file://${root}/dist/live/contracts/index.js`;
  // file:// ESM 动态 import 在 Chromium 中被限制；改为注入源码文本。
  const diffCoreSource = await readFile(
    `${root}/dist/live/measure/diff-core.js`,
    "utf8",
  );
  const sessionSource = await readFile(
    `${root}/dist/live/contracts/session.js`,
    "utf8",
  );
  // 契约模块是类型专用，编译产物应为空导出；确认核心不需要它即可加载。
  assert.match(sessionSource, /export \{\}|export\s*\{/);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => {
      throw error;
    });
    const vectors = buildVectors();
    const result = await page.evaluate(
      async ({ source, vectors }) => {
        // 在浏览器内以 Blob URL 加载核心模块，验证浏览器可直接执行。
        const blob = new Blob([source], { type: "text/javascript" });
        const url = URL.createObjectURL(blob);
        try {
          const core = await import(url);
          const outcome = core.measurePixelDifference(
            {
              width: vectors.width,
              height: vectors.height,
              pixels: new Uint8Array(vectors.native),
            },
            {
              width: vectors.width,
              height: vectors.height,
              pixels: new Uint8Array(vectors.compat),
            },
          );
          const normalized = core.normalizePixels({
            width: 1,
            height: 1,
            pixels: new Uint8Array([9, 9, 9, 0]),
          });
          return {
            status: outcome.status,
            metrics: outcome.status === "measured" ? outcome.metrics : null,
            normalizedResidue: [...normalized.pixels],
            errorName: core.MeasurementError?.name ?? null,
          };
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      { source: diffCoreSource, vectors },
    );
    assert.equal(result.status, "measured");
    assert.deepEqual(result.metrics, expectedMetrics);
    assert.deepEqual(result.normalizedResidue, [0, 0, 0, 0]);
    assert.equal(result.errorName, "MeasurementError");
  } finally {
    await browser.close();
  }
});
