import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createCleanupRegistry } from "../../../dist/live/runner/executor.js";

const root = fileURLToPath(new URL("../../..", import.meta.url));

test("cleanup registry runs callbacks in reverse order, is idempotent and surfaces failures", async () => {
  const registry = createCleanupRegistry();
  const order = [];
  registry.register(() => order.push("first"));
  registry.register(() => order.push("second"));
  await registry.disposeAll();
  await registry.disposeAll();
  assert.deepEqual(order, ["second", "first"]);

  const failing = createCleanupRegistry();
  const ran = [];
  failing.register(() => ran.push("a"));
  failing.register(() => {
    throw new Error("boom");
  });
  failing.register(() => ran.push("b"));
  await assert.rejects(() => failing.disposeAll(), /boom/);
  assert.deepEqual(ran, ["b", "a"]);
});

test("cleanup unregister is idempotent and excludes the callback", async () => {
  const registry = createCleanupRegistry();
  let calls = 0;
  const unregister = registry.register(() => calls++);
  unregister();
  unregister();
  await registry.disposeAll();
  assert.equal(calls, 0);
});

test("cleanup unregister only removes its own registration for duplicate callbacks", async () => {
  const registry = createCleanupRegistry();
  const order = [];
  const cleanup = () => order.push("shared");
  registry.register(() => order.push("first"));
  const unregisterShared = registry.register(cleanup);
  registry.register(() => order.push("middle"));
  registry.register(cleanup);
  unregisterShared();
  await registry.disposeAll();
  // 注销只移除第一次 shared；逆序执行：shared(第二次) → middle → first。
  assert.deepEqual(order, ["shared", "middle", "first"]);
});

test("concurrent disposeAll calls share the same promise and await all callbacks", async () => {
  const registry = createCleanupRegistry();
  let resolveCleanup;
  const gate = new Promise((resolve) => {
    resolveCleanup = resolve;
  });
  const order = [];
  registry.register(async () => {
    await gate;
    order.push("slow");
  });
  registry.register(() => order.push("fast"));

  const first = registry.disposeAll();
  const second = registry.disposeAll();
  assert.strictEqual(first, second);

  // 清理尚未完成时，并发调用方不会提前收到完成。
  let settled = false;
  void Promise.allSettled([first, second]).then(() => {
    settled = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(settled, false);

  resolveCleanup();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["fast", "slow"]);
  assert.equal(settled, true);
});

test("live tool modules stay browser-safe: no Node builtins or non-relative imports", async () => {
  for (const path of [
    "dist/live/contracts/session.js",
    "dist/live/contracts/index.js",
    "dist/live/measure/diff-core.js",
    "dist/live/runner/executor.js",
    "dist/live/controller/coordinator.js",
    "dist/live/view/view.js",
  ]) {
    const source = await readFile(`${root}/${path}`, "utf8");
    assert.ok(
      !/\bnode:|from\s*["'](?:fs|path|pngjs|node:)/.test(source),
      `${path} must not import Node-only modules`,
    );
    for (const [, specifier] of source.matchAll(/\bfrom\s*["']([^"']+)["']/g)) {
      assert.ok(
        specifier.startsWith("./") || specifier.startsWith("../"),
        `${path} has non-relative import ${specifier}`,
      );
    }
  }
});

test("frozen contracts keep the agreed shape", async () => {
  const source = await readFile(
    `${root}/test/live/contracts/session.ts`,
    "utf8",
  );
  // 消息必须带 sessionId 与 side；completed 必须携带最终像素。
  for (const fragment of [
    'readonly type: "ready"',
    'readonly type: "completed"',
    "readonly pixels: PixelData",
    "readonly sessionId: SessionId",
    "readonly side: Side",
  ])
    assert.ok(source.includes(fragment), `missing ${fragment}`);
  // 失败反馈不携带数值指标。
  const failed = source.slice(source.indexOf('status: "failed"'));
  const measured = source.slice(source.indexOf('status: "measured"'));
  assert.ok(measured.includes("changedPixels"));
  assert.ok(!failed.slice(0, failed.indexOf("}")).includes("changedPixels"));
});
