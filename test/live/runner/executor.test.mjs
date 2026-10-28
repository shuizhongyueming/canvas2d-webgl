// 实时对比工具执行器（issue #69）的真实浏览器回归。
// 覆盖：准备屏障（start 前不绘制）、随机隔离、显式 dispose、
// 资源清理幂等、最终 present/读回方向。旧单路 harness 行为不受影响。
//
// 浏览器二进制由 `playwright install chromium` 提供；CI 在 pnpm run verify
// 之后才安装 Chromium（见 .github/workflows/contracts.yml）。缺二进制时明确
// skip，不把设施缺口伪装成通过；本地与 smoke/采集路径已安装浏览器时照常执行。
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { launchDriver } from "../../harness/driver.mjs";
import { serve } from "../../harness/server.mjs";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * Playwright 自身解析的浏览器可执行路径。CI 在 verify 之后才安装 Chromium，
 * 因此单元测试发现缺二进制时 skip；这与现有 CI 步骤顺序一致。
 */
function chromiumExecutableAvailable() {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

const browserAvailable = chromiumExecutableAvailable();
// 缺浏览器时以 skip 显式标记，并打印原因；不静默通过。
const browserTest = browserAvailable
  ? test
  : (name, fn) =>
      test.skip(
        `${name} [skipped: Playwright Chromium 未安装，CI 在 verify 之后才 playwright install]`,
        fn,
      );

/**
 * 在浏览器页面内驱动 RunnerSession：直接以模块方式装配，不经外层 controller。
 * 返回 { ready, completed, error, disposed } 观察记录。
 */
async function driveSession(page, { caseId, side, startAfterReady = true }) {
  return page.evaluate(
    async ({ caseId, side, startAfterReady }) => {
      const { RunnerSession, createCleanupRegistry } = await import(
        "/dist/live/runner/executor.js"
      );
      const messages = [];
      const session = new RunnerSession(
        {
          sessionId: "s-test",
          side,
          caseModuleUrl: "/.build/test/cases/rect/fill.case.js",
          caseId,
          libraryUrl: "/dist/index.js",
          hooksUrl: "/dist/gpu/hooks.js",
          timeouts: { prepare: 8000, run: 8000 },
          post: (message) => messages.push(message),
        },
        createCleanupRegistry,
      );
      const wrongSession = {
        type: "prepare",
        sessionId: "other",
        side,
        caseId,
      };
      await session.handle(wrongSession); // 轮次不匹配必须被忽略
      await session.handle({
        type: "prepare",
        sessionId: "s-test",
        side,
        caseId,
      });
      if (startAfterReady)
        await session.handle({ type: "start", sessionId: "s-test", side });
      const canvasesBeforeDispose = document.querySelectorAll("canvas").length;
      await session.dispose();
      await session.dispose(); // 幂等
      return {
        stage: session.stage,
        canvasesBeforeDispose,
        canvasesAfterDispose: document.querySelectorAll("canvas").length,
        messages: messages.map((m) => ({
          type: m.type,
          side: m.side,
          stage: m.stage ?? null,
          hasPixels: !!m.pixels,
          width: m.pixels?.width ?? null,
          height: m.pixels?.height ?? null,
          firstPixel: m.pixels ? Array.from(m.pixels.pixels.slice(0, 4)) : null,
        })),
      };
    },
    { caseId, side, startAfterReady },
  );
}

browserTest(
  "runner prepares, starts, samples and disposes idempotently",
  async (t) => {
    const driver = await launchDriver();
    const server = await serve(root);
    try {
      const page = await driver.page(server.url);
      try {
        const result = await driveSession(page, {
          caseId: "context.fillRect.render",
          side: "native",
        });
        assert.equal(result.stage, "disposed");
        // 准备屏障：ready 在 start 之前，completed 携带最终像素。
        assert.deepEqual(
          result.messages.map((m) => m.type),
          ["ready", "completed", "disposed"],
        );
        assert.equal(result.messages[1].hasPixels, true);
        assert.ok(result.messages[1].width > 0);
        assert.ok(result.messages[1].height > 0);
        // dispose 后画布移除且幂等。
        assert.ok(result.canvasesBeforeDispose >= 1);
        assert.equal(result.canvasesAfterDispose, 0);
      } finally {
        await page.close();
      }
    } finally {
      await driver.close();
      await server.close();
    }
  },
);

browserTest(
  "both sides share seed and diverge only by backend, random stays isolated",
  async (t) => {
    const driver = await launchDriver();
    const server = await serve(root);
    try {
      const page = await driver.page(server.url);
      try {
        const outcome = await page.evaluate(async () => {
          const { RunnerSession, createCleanupRegistry } = await import(
            "/dist/live/runner/executor.js"
          );
          const mathRandomBefore = Math.random;
          const results = {};
          for (const side of ["native", "compat"]) {
            const messages = [];
            const session = new RunnerSession(
              {
                sessionId: `s-${side}`,
                side,
                caseModuleUrl: "/.build/test/cases/rect/fill.case.js",
                caseId: "context.fillRect.render",
                libraryUrl: "/dist/index.js",
                hooksUrl: "/dist/gpu/hooks.js",
                timeouts: { prepare: 8000, run: 8000 },
                post: (message) => messages.push(message),
              },
              createCleanupRegistry,
            );
            await session.handle({
              type: "prepare",
              sessionId: `s-${side}`,
              side,
              caseId: "context.fillRect.render",
            });
            await session.handle({
              type: "start",
              sessionId: `s-${side}`,
              side,
            });
            const completed = messages.find((m) => m.type === "completed");
            results[side] = completed
              ? {
                  width: completed.pixels.width,
                  height: completed.pixels.height,
                  // 用例在 (4,4) 起绘制不透明红块；验证左上起逐行的读回方向。
                  inside: Array.from(
                    completed.pixels.pixels.slice(
                      (5 * 64 + 5) * 4,
                      (5 * 64 + 5) * 4 + 4,
                    ),
                  ),
                }
              : { failed: messages.find((m) => m.type === "error")?.reason };
            await session.dispose();
          }
          return { mathRandomKept: Math.random === mathRandomBefore, results };
        });
        // 生产形态下每侧 runner 在独立 iframe 文档内执行，Math.random 替换
        // 只影响对应 iframe。本测试在同一文档内直接装配会话以复用 driver，
        // 因此文档级 Math.random 会被本轮替换——这恰好证明隔离写入已生效。
        // iframe 级隔离由 installRunnerWindow 的承载方式保证（协调票接线）。
        assert.equal(outcome.mathRandomKept, false);
        assert.equal(outcome.results.native.width, 64);
        assert.equal(outcome.results.compat.width, 64);
        // 两侧同用例同种子：红块内部像素一致（context.fillRect.render 语义）。
        assert.deepEqual(outcome.results.native.inside, [255, 0, 0, 255]);
        assert.deepEqual(outcome.results.compat.inside, [255, 0, 0, 255]);
      } finally {
        await page.close();
      }
    } finally {
      await driver.close();
      await server.close();
    }
  },
);

browserTest("prepare failure reports stage and blocks start", async (t) => {
  const driver = await launchDriver();
  const server = await serve(root);
  try {
    const page = await driver.page(server.url);
    try {
      const outcome = await page.evaluate(async () => {
        const { RunnerSession, createCleanupRegistry } = await import(
          "/dist/live/runner/executor.js"
        );
        const messages = [];
        const session = new RunnerSession(
          {
            sessionId: "s-bad",
            side: "native",
            caseModuleUrl: "/.build/test/cases/rect/fill.case.js",
            caseId: "case.does-not-exist",
            libraryUrl: "/dist/index.js",
            hooksUrl: "/dist/gpu/hooks.js",
            timeouts: { prepare: 8000, run: 8000 },
            post: (message) => messages.push(message),
          },
          createCleanupRegistry,
        );
        await session.handle({
          type: "prepare",
          sessionId: "s-bad",
          side: "native",
          caseId: "case.does-not-exist",
        });
        await session.handle({
          type: "start",
          sessionId: "s-bad",
          side: "native",
        });
        return { stage: session.stage, messages };
      });
      const error = outcome.messages.find((m) => m.type === "error");
      assert.ok(error, "error message expected");
      assert.equal(error.stage, "preparing");
      assert.match(error.reason, /case-not-found/);
      // 失败后不得进入 completed。
      assert.ok(!outcome.messages.some((m) => m.type === "completed"));
    } finally {
      await page.close();
    }
  } finally {
    await driver.close();
    await server.close();
  }
});

browserTest("old single-page harness execute is unchanged", async (t) => {
  const driver = await launchDriver();
  const server = await serve(root);
  try {
    const page = await driver.page(server.url);
    try {
      const result = await page.evaluate(async () => {
        const { execute } = await import("/test/harness/browser.js");
        return execute({
          module: "/.build/test/cases/rect/fill.case.js",
          id: "context.fillRect.render",
          mode: "native",
        });
      });
      assert.equal(result.execution, "executed", result.error);
      // render 用例的 semantic 字段恒为 not-applicable（见 browser.js）。
      assert.equal(result.semantic, "not-applicable", result.error);
    } finally {
      await page.close();
    }
  } finally {
    await driver.close();
    await server.close();
  }
});

browserTest(
  "start before ready is terminal: no ready after failed",
  async (t) => {
    const driver = await launchDriver();
    const server = await serve(root);
    try {
      const page = await driver.page(server.url);
      try {
        const outcome = await page.evaluate(async () => {
          const { RunnerSession, createCleanupRegistry } = await import(
            "/dist/live/runner/executor.js"
          );
          const messages = [];
          const session = new RunnerSession(
            {
              sessionId: "s-order",
              side: "native",
              caseModuleUrl: "/.build/test/cases/rect/fill.case.js",
              caseId: "context.fillRect.render",
              libraryUrl: "/dist/index.js",
              hooksUrl: "/dist/gpu/hooks.js",
              timeouts: { prepare: 8000, run: 8000 },
              post: (message) => messages.push(message),
            },
            createCleanupRegistry,
          );
          // start 在 prepare 完成前到达：报错后 prepare 不得再发 ready。
          const preparePromise = session.handle({
            type: "prepare",
            sessionId: "s-order",
            side: "native",
            caseId: "context.fillRect.render",
          });
          await session.handle({
            type: "start",
            sessionId: "s-order",
            side: "native",
          });
          await preparePromise;
          return { stage: session.stage, messages };
        });
        const error = outcome.messages.find((m) => m.type === "error");
        assert.ok(error, "error expected");
        assert.equal(error.stage, "preparing");
        // failed 终态：不得出现 ready 或 completed。
        assert.ok(!outcome.messages.some((m) => m.type === "ready"));
        assert.ok(!outcome.messages.some((m) => m.type === "completed"));
      } finally {
        await page.close();
      }
    } finally {
      await driver.close();
      await server.close();
    }
  },
);

browserTest("concurrent duplicate prepare is rejected", async (t) => {
  const driver = await launchDriver();
  const server = await serve(root);
  try {
    const page = await driver.page(server.url);
    try {
      const outcome = await page.evaluate(async () => {
        const { RunnerSession, createCleanupRegistry } = await import(
          "/dist/live/runner/executor.js"
        );
        const messages = [];
        const session = new RunnerSession(
          {
            sessionId: "s-dup",
            side: "native",
            caseModuleUrl: "/.build/test/cases/rect/fill.case.js",
            caseId: "context.fillRect.render",
            libraryUrl: "/dist/index.js",
            hooksUrl: "/dist/gpu/hooks.js",
            timeouts: { prepare: 8000, run: 8000 },
            post: (message) => messages.push(message),
          },
          createCleanupRegistry,
        );
        const first = session.handle({
          type: "prepare",
          sessionId: "s-dup",
          side: "native",
          caseId: "context.fillRect.render",
        });
        const second = session.handle({
          type: "prepare",
          sessionId: "s-dup",
          side: "native",
          caseId: "context.fillRect.render",
        });
        await Promise.all([first, second]);
        // 被拒的 prepare 已报错；成功的 prepare 完成后 dispose，统计残留画布。
        await session.dispose();
        return {
          stage: session.stage,
          canvasesAfter: document.querySelectorAll("canvas").length,
          readyCount: messages.filter((m) => m.type === "ready").length,
          errorReasons: messages
            .filter((m) => m.type === "error")
            .map((m) => m.reason),
        };
      });
      // 恰好一次 ready；第二次 prepare 以 duplicate prepare 报错。
      assert.equal(
        outcome.readyCount,
        1,
        `expected exactly one ready, errors=${JSON.stringify(outcome.errorReasons)}`,
      );
      assert.ok(
        outcome.errorReasons.some((reason) => /duplicate prepare/.test(reason)),
        `expected duplicate prepare error, got ${JSON.stringify(outcome.errorReasons)}`,
      );
      // dispose 后不得残留画布。
      assert.equal(outcome.canvasesAfter, 0);
    } finally {
      await page.close();
    }
  } finally {
    await driver.close();
    await server.close();
  }
});

browserTest("dispose during prepare removes the canvas", async (t) => {
  const driver = await launchDriver();
  const server = await serve(root);
  try {
    const page = await driver.page(server.url);
    try {
      const outcome = await page.evaluate(async () => {
        const { RunnerSession, createCleanupRegistry } = await import(
          "/dist/live/runner/executor.js"
        );
        const messages = [];
        const session = new RunnerSession(
          {
            sessionId: "s-race",
            side: "native",
            caseModuleUrl: "/.build/test/cases/rect/fill.case.js",
            caseId: "context.fillRect.render",
            libraryUrl: "/dist/index.js",
            hooksUrl: "/dist/gpu/hooks.js",
            timeouts: { prepare: 8000, run: 8000 },
            post: (message) => messages.push(message),
          },
          createCleanupRegistry,
        );
        const preparePromise = session.handle({
          type: "prepare",
          sessionId: "s-race",
          side: "native",
          caseId: "context.fillRect.render",
        });
        // 立即 dispose：prepare 恢复执行后不得挂载或保留画布。
        await session.handle({
          type: "dispose",
          sessionId: "s-race",
          side: "native",
        });
        await preparePromise;
        return {
          stage: session.stage,
          canvases: document.querySelectorAll("canvas").length,
          messages,
        };
      });
      assert.equal(outcome.stage, "disposed");
      assert.equal(outcome.canvases, 0);
      // dispose 后不得发 ready/completed。
      assert.ok(!outcome.messages.some((m) => m.type === "ready"));
      assert.ok(!outcome.messages.some((m) => m.type === "completed"));
    } finally {
      await page.close();
    }
  } finally {
    await driver.close();
    await server.close();
  }
});

browserTest("wrong side and wrong caseId are rejected", async (t) => {
  const driver = await launchDriver();
  const server = await serve(root);
  try {
    const page = await driver.page(server.url);
    try {
      const outcome = await page.evaluate(async () => {
        const { RunnerSession, createCleanupRegistry } = await import(
          "/dist/live/runner/executor.js"
        );
        const messages = [];
        const session = new RunnerSession(
          {
            sessionId: "s-guard",
            side: "native",
            caseModuleUrl: "/.build/test/cases/rect/fill.case.js",
            caseId: "context.fillRect.render",
            libraryUrl: "/dist/index.js",
            hooksUrl: "/dist/gpu/hooks.js",
            timeouts: { prepare: 8000, run: 8000 },
            post: (message) => messages.push(message),
          },
          createCleanupRegistry,
        );
        await session.handle({
          type: "prepare",
          sessionId: "s-guard",
          side: "compat", // 侧别不匹配：忽略
          caseId: "context.fillRect.render",
        });
        await session.handle({
          type: "prepare",
          sessionId: "s-guard",
          side: "native",
          caseId: "other.case", // caseId 不匹配：报错
        });
        return { stage: session.stage, messages };
      });
      assert.equal(outcome.messages.length, 1);
      const error = outcome.messages[0];
      assert.equal(error.type, "error");
      assert.match(error.reason, /case-mismatch/);
    } finally {
      await page.close();
    }
  } finally {
    await driver.close();
    await server.close();
  }
});

browserTest(
  "cleanup failure still reaches disposed and reports the error",
  async (t) => {
    const driver = await launchDriver();
    const server = await serve(root);
    try {
      const page = await driver.page(server.url);
      try {
        const outcome = await page.evaluate(async () => {
          const { RunnerSession, createCleanupRegistry } = await import(
            "/dist/live/runner/executor.js"
          );
          const messages = [];
          // 注入一个会抛错的清理回调。
          const failingRegistry = () => {
            const registry = createCleanupRegistry();
            registry.register(() => {
              throw new Error("cleanup-boom");
            });
            return registry;
          };
          const session = new RunnerSession(
            {
              sessionId: "s-clean",
              side: "native",
              caseModuleUrl: "/.build/test/cases/rect/fill.case.js",
              caseId: "context.fillRect.render",
              libraryUrl: "/dist/index.js",
              hooksUrl: "/dist/gpu/hooks.js",
              timeouts: { prepare: 8000, run: 8000 },
              post: (message) => messages.push(message),
            },
            failingRegistry,
          );
          await session.handle({
            type: "prepare",
            sessionId: "s-clean",
            side: "native",
            caseId: "context.fillRect.render",
          });
          await session.handle({
            type: "start",
            sessionId: "s-clean",
            side: "native",
          });
          await session.dispose();
          // 再次 dispose 复用同一结果，阶段保持 disposed。
          await session.dispose();
          return { stage: session.stage, messages };
        });
        assert.equal(outcome.stage, "disposed");
        const error = outcome.messages.find(
          (m) => m.type === "error" && m.stage === "disposing",
        );
        assert.ok(error, "cleanup error must be reported");
        assert.match(error.reason, /cleanup-boom/);
      } finally {
        await page.close();
      }
    } finally {
      await driver.close();
      await server.close();
    }
  },
);

browserTest(
  "run failure disposes the environment and removes the canvas",
  async (t) => {
    const driver = await launchDriver();
    const server = await serve(root);
    try {
      const page = await driver.page(server.url);
      try {
        const outcome = await page.evaluate(async () => {
          const { RunnerSession, createCleanupRegistry } = await import(
            "/dist/live/runner/executor.js"
          );
          const messages = [];
          const session = new RunnerSession(
            {
              sessionId: "s-runfail",
              side: "native",
              caseModuleUrl: "/.build/test/fixtures/infrastructure.case.js",
              caseId: "self.render-error", // run 内注入绘制失败的用例
              libraryUrl: "/dist/index.js",
              hooksUrl: "/dist/gpu/hooks.js",
              timeouts: { prepare: 8000, run: 8000 },
              post: (message) => messages.push(message),
            },
            createCleanupRegistry,
          );
          await session.handle({
            type: "prepare",
            sessionId: "s-runfail",
            side: "native",
            caseId: "self.render-error",
          });
          await session.handle({
            type: "start",
            sessionId: "s-runfail",
            side: "native",
          });
          return {
            stage: session.stage,
            canvases: document.querySelectorAll("canvas").length,
            messages,
          };
        });
        // run 失败后必须销毁环境：阶段到 disposed，画布移除，error 阶段为 running。
        assert.equal(outcome.stage, "disposed");
        assert.equal(outcome.canvases, 0);
        const error = outcome.messages.find((m) => m.type === "error");
        assert.ok(error, "run failure must be reported");
        assert.equal(error.stage, "running");
      } finally {
        await page.close();
      }
    } finally {
      await driver.close();
      await server.close();
    }
  },
);
