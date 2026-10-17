// Real-browser infrastructure regressions; separate from deterministic Node tests.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { decode } from "../test/harness/evidence.mjs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { collect } from "../test/harness/collect.mjs";
import { launchDriver } from "../test/harness/driver.mjs";
import { serve } from "../test/harness/server.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const options = {
  selfTest: true,
  software: process.argv.includes("--software"),
  output: resolve(root, "test-results/infrastructure"),
};
const normal = await collect(root, options);
assert.equal(normal.code, 0, normal.run.error);
const pair = normal.run.results.find((r) => r.caseId === "self.native-pair");
assert.equal(pair.difference.scene.changedPixels, 0);
assert.equal(pair.difference.display.changedPixels, 0);
const injected = normal.run.results.find(
  (r) => r.caseId === "self.local-difference",
);
assert.equal(injected.difference.scene.changedPixels, 1);
assert.deepEqual(injected.difference.scene.bounds, {
  x: 17,
  y: 24,
  width: 1,
  height: 1,
});
const displayInjected = normal.run.results.find(
  (r) => r.caseId === "self.display-difference",
);
assert.equal(displayInjected.difference.scene.changedPixels, 0);
assert.equal(displayInjected.difference.display.changedPixels, 12);
assert.deepEqual(displayInjected.difference.display.bounds, {
  x: 80,
  y: 4,
  width: 4,
  height: 3,
});
const displayDir = dirname(normal.path);
const pixel = (png, x, y) => [
  ...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4),
];
const displayActual = decode(
  await readFile(join(displayDir, displayInjected.artifacts.displayActual)),
);
const displayReference = decode(
  await readFile(join(displayDir, displayInjected.artifacts.displayReference)),
);
assert.deepEqual(pixel(displayActual, 80, 4), [255, 0, 255, 255]);
assert.deepEqual(pixel(displayReference, 80, 4), [255, 255, 255, 255]);
for (const [caseId, code, pattern] of [
  ["self.render-error", 1, /injected drawing failure/],
  ["self.skip", 2, /skip:/],
  ["self.font-unready", 2, /font-not-ready/],
]) {
  const result = await collect(root, { ...options, caseId });
  assert.equal(result.code, code, JSON.stringify(result.run));
  assert.match(
    result.run.results.find((r) => r.caseId === caseId).error,
    pattern,
  );
  if (caseId === "self.render-error") {
    const evidence = result.run.results.find((r) => r.caseId === caseId);
    for (const key of ["reference", "actual"]) {
      const png = decode(
        await readFile(join(dirname(result.path), evidence.artifacts[key])),
      );
      assert.deepEqual(
        pixel(png, 10, 10),
        [255, 0, 0, 255],
        "failure retains drawn red rectangle",
      );
      assert.deepEqual(
        pixel(png, 0, 0),
        [0, 0, 0, 0],
        "untouched scene remains transparent",
      );
    }
  }
  if (caseId === "self.skip") {
    const check = spawnSync(
      process.execPath,
      ["scripts/testing.mjs", "acceptance", "--run", result.path],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(check.status, 2);
    assert.doesNotMatch(
      check.stdout,
      /missing-required-declaration|unknown-required-case|unexpected-result/,
    );
  }
}
const gpu = await collect(root, { ...options, disableGPU: true });
assert.equal(gpu.code, 2);
assert.match(gpu.run.error, /webgl-unavailable/);
const cli = (stage, ...args) =>
  spawnSync(process.execPath, ["scripts/testing.mjs", stage, ...args], {
    cwd: root,
    encoding: "utf8",
  });
const report = cli("report", "--run", normal.path);
assert.equal(report.status, 0, report.stderr);
const acceptance = cli("acceptance", "--run", normal.path);
assert.equal(acceptance.status, 2, acceptance.stderr);
assert.match(acceptance.stdout, /infrastructure-only/);
assert.match(acceptance.stdout, /pending-review/);
// Prove the actual compatibility branch calls the real factory and never swaps in native.
const driver = await launchDriver(options),
  server = await serve(root);
try {
  const page = await driver.page(server.url);
  try {
    const result = await page.evaluate(async () => {
      const { execute } = await import("/test/harness/browser.js");
      return execute({
        module: "/.build/test/fixtures/infrastructure.case.js",
        id: "self.native-pair",
        mode: "compat",
      });
    });
    if (result.execution === "blocked")
      assert.ok(
        ["not-implemented", "test-hooks-unavailable"].includes(result.code),
        result.error,
      );
    else {
      assert.equal(result.execution, "executed");
      assert.equal(result.semantic, "pass", result.error);
    }
  } finally {
    await page.close();
  }
} finally {
  await driver.close();
  await server.close();
}
console.log(
  JSON.stringify(
    {
      infrastructure: "passed",
      run: normal.path,
      environment: normal.run.environment,
      compatibilityAccepted: false,
    },
    null,
    2,
  ),
);
