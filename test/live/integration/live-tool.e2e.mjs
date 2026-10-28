// #72 真实工具端到端。覆盖真实 iframe、Canvas2D/WebGL 与共享量测核心。
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createLiveServer } from "../../../scripts/live-server.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const output = resolveOutput();
await mkdir(output, { recursive: true });
assert.ok(
  existsSync(chromium.executablePath()),
  "Playwright Chromium 未安装；请运行 pnpm exec playwright install chromium",
);
const server = await createLiveServer({ root });
const browser = await chromium.launch({ headless: true });
let context = await browser.newContext({
  viewport: { width: 1200, height: 900 },
  deviceScaleFactor: 1,
});
let page = await context.newPage();
page.setDefaultTimeout(15000);
const browserErrors = [];
const failedRequests = [];
page.on("pageerror", (error) => browserErrors.push(error.message));
page.on("response", (response) => {
  if (response.status() >= 400)
    failedRequests.push(`${response.status()} ${response.url()}`);
});
const coverage = [];
const failures = [];
await page.addInitScript(() => {
  const counts = {
    iframeCreated: 0,
    iframeDisposed: 0,
    iframeResourcesDisposed: 0,
    peakFrames: 0,
    contexts: new Set(),
  };
  Object.defineProperty(window, "__liveAudit", { value: counts });
  const Element = window.Element;
  const append = Element.prototype.append;
  Element.prototype.append = function (...nodes) {
    const result = append.apply(this, nodes);
    for (const node of nodes)
      if (node instanceof HTMLIFrameElement) {
        counts.iframeCreated += 1;
        counts.peakFrames = Math.max(
          counts.peakFrames,
          document.querySelectorAll("iframe").length,
        );
        const audit = () => {
          if (!node.isConnected) return;
          const doc = node.contentDocument;
          if (!doc) return;
          const canvas = doc.querySelector("#target");
          if (!canvas) return;
          if (!counts.contexts.has(canvas)) {
            counts.contexts.add(canvas);
            window.__liveContextAudit?.(canvas, node.contentWindow);
          }
        };
        node.addEventListener("load", audit);
        node.addEventListener("load", () => {
          node.contentWindow?.addEventListener("pagehide", () => {
            counts.iframeDisposed += 1;
          });
        });
      }
    return result;
  };
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message?.type === "disposed") {
      counts.iframeResourcesDisposed += 1;
      return;
    }
    if (message?.type !== "completed") return;
    const frame = [...document.querySelectorAll("iframe")].find(
      (candidate) => candidate.contentWindow === event.source,
    );
    if (!frame || frame.dataset.sessionId !== message.sessionId) return;
    if (!window.__liveSamples) window.__liveSamples = {};
    if (!window.__liveSamples[message.sessionId])
      window.__liveSamples[message.sessionId] = {};
    window.__liveSamples[message.sessionId][message.side] = {
      width: message.pixels.width,
      height: message.pixels.height,
      pixels: [...message.pixels.pixels],
    };
  });
});

function resolveOutput() {
  const index = process.argv.indexOf("--output");
  return index >= 0
    ? fileURLToPath(new URL(`file://${process.argv[index + 1]}`))
    : fileURLToPath(
        new URL("../../../test-results/live-tool/", import.meta.url),
      );
}

async function check(name, action) {
  try {
    const details = await action();
    coverage.push({ name, status: "passed", details });
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error: String(error?.stack ?? error) });
    coverage.push({ name, status: "failed", error: String(error) });
    console.error(`FAIL ${name}: ${error}`);
    await page.screenshot({ path: `${output}/failure-${failures.length}.png` });
  }
}

async function state() {
  return page.evaluate(async () => {
    const { coordinator } = await window.__liveTestPage;
    return coordinator.state;
  });
}

async function waitTerminal() {
  const expected = await page.evaluate(
    async () => (await window.__liveTestPage).coordinator.state.sessionId,
  );
  await page.waitForFunction(
    (expected) => {
      if (!window.__liveCoordinator) return false;
      return (
        window.__liveCoordinator.state.sessionId === expected &&
        ["completed", "failed"].includes(window.__liveCoordinator.state.stage)
      );
    },
    expected,
    { timeout: 20000 },
  );
  return state();
}

async function select(caseId) {
  await page.waitForFunction(() => window.__liveTestPage !== undefined);
  await page.evaluate(async () => {
    window.__liveCoordinator = (await window.__liveTestPage).coordinator;
  });
  const current = await page.evaluate(() => window.__liveCoordinator.state);
  if (current.caseId !== caseId)
    await page.selectOption(".live-case-select", caseId);
  else await page.click(".live-actions button:nth-child(1)");
  await page.waitForFunction(
    ({ id, previousSession }) =>
      window.__liveCoordinator.state.caseId === id &&
      window.__liveCoordinator.state.sessionId !== previousSession,
    { id: caseId, previousSession: current.sessionId },
  );
}

async function feedback() {
  return page.evaluate(async () => {
    const { coordinator } = await window.__liveTestPage;
    return coordinator.feedback();
  });
}

async function sampleDifference() {
  return page.evaluate(() => {
    const canvas = document.querySelector(".live-diff-canvas");
    if (!canvas.width || !canvas.height)
      return { width: 0, height: 0, changed: 0, valid: true };
    const pixels = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let changed = 0;
    let valid = true;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] === 0) {
        if (pixels[index] || pixels[index + 1] || pixels[index + 2])
          valid = false;
      } else {
        changed += 1;
        if (
          pixels[index] !== 255 ||
          pixels[index + 1] !== 0 ||
          pixels[index + 2] !== 180 ||
          pixels[index + 3] !== 255
        )
          valid = false;
      }
    }
    return { width: canvas.width, height: canvas.height, changed, valid };
  });
}

try {
  await page.goto(`${server.url}/?testController=1`);
  await page.waitForFunction(() => window.__liveTestPage !== undefined);
  await page.evaluate(async () => {
    window.__liveCoordinator = (await window.__liveTestPage).coordinator;
  });
  await waitTerminal();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await check("真实目录无静默遗漏", async () => {
    const ids = await page
      .locator(".live-case-select option")
      .evaluateAll((options) => options.map((option) => option.value));
    assert.equal(ids.length, server.catalog.length);
    assert.deepEqual(
      ids,
      server.catalog.map((entry) => entry.id),
    );
    return { included: ids.length };
  });

  await check("全部展示条目逐项执行", async () => {
    const results = [];
    for (const entry of server.catalog) {
      try {
        await select(entry.id);
        const terminal = await waitTerminal();
        const report = await feedback();
        const result = {
          id: entry.id,
          status: terminal.stage,
          difference:
            terminal.stage === "completed"
              ? {
                  changedPixels: report.difference.changedPixels,
                  totalPixels: report.difference.totalPixels,
                  maxChannelDelta: report.difference.maxChannelDelta,
                }
              : null,
          error: terminal.error,
        };
        results.push(result);
        console.log(
          `CASE ${result.status} ${entry.id}${
            result.error ? ` ${result.error.stage}: ${result.error.reason}` : ""
          }`,
        );
        assert.ok(
          terminal.stage === "completed" || terminal.error?.reason,
          "失败条目必须保留执行阶段和原因",
        );
      } catch (error) {
        results.push({
          id: entry.id,
          status: "infrastructure-failed",
          difference: null,
          error: String(error?.stack ?? error),
        });
        console.error(`CASE INFRASTRUCTURE-FAILED ${entry.id}: ${error}`);
      }
    }
    await writeFile(
      `${output}/catalog-results.json`,
      `${JSON.stringify({ compatibilityAccepted: false, results }, null, 2)}\n`,
    );
    assert.equal(results.length, server.catalog.length);
    assert.deepEqual(
      results.filter((result) => result.status === "infrastructure-failed"),
      [],
    );
    return {
      completed: results.filter((result) => result.status === "completed")
        .length,
      report: "catalog-results.json",
    };
  });

  for (const [group, ids] of Object.entries({
    字体文字: ["context.fillText.render", "text.render.cjk"],
    路径: ["context.fill.render", "path.stroke.linejoin-linecap"],
    透明低alpha: ["rect.fillRect.alpha-overlap", "text.render.paint-alpha"],
    跨帧: ["rect.frame-persistence", "IMG-02.same-task-mutations"],
    跨realm: ["image.offscreen-cross-realm"],
  })) {
    for (const id of ids) {
      await check(`${group}：${id}`, async () => {
        await select(id);
        const terminal = await waitTerminal();
        assert.equal(terminal.stage, "completed", terminal.error?.reason);
        const report = await feedback();
        assert.equal(report.difference.status, "measured");
        const image = await sampleDifference();
        assert.equal(image.changed, report.difference.changedPixels);
        assert.equal(image.valid, true);
        assert.equal(image.width, report.difference.nativeSize.width);
        assert.equal(image.height, report.difference.nativeSize.height);
        const liveCanvases = await page
          .locator("iframe")
          .evaluateAll((frames) =>
            frames.map((frame) => ({
              width: frame.contentDocument.querySelector("#target").width,
              height: frame.contentDocument.querySelector("#target").height,
              webgl:
                frame.dataset.side !== "compat" ||
                Boolean(
                  frame.contentDocument
                    .querySelector("#target")
                    .getContext("webgl"),
                ),
            })),
          );
        assert.equal(liveCanvases.length, 2);
        assert.ok(liveCanvases.every((canvas) => canvas.webgl));
        return {
          metrics: {
            changedPixels: report.difference.changedPixels,
            totalPixels: report.difference.totalPixels,
            maxChannelDelta: report.difference.maxChannelDelta,
            differenceBounds: report.difference.differenceBounds,
          },
          image,
          liveCanvases,
        };
      });
    }
  }

  await check("Node 与浏览器共享量测一致", async () => {
    const report = await feedback();
    const sessionId = (await state()).sessionId;
    const samples = await page.evaluate(
      (id) => window.__liveSamples[id],
      sessionId,
    );
    const { measurePixelDifference, diffPixels, normalizePixels } =
      await import("../../../dist/live/measure/diff-core.js");
    const native = {
      ...samples.native,
      pixels: new Uint8Array(samples.native.pixels),
    };
    const compat = {
      ...samples.compat,
      pixels: new Uint8Array(samples.compat.pixels),
    };
    const measured = measurePixelDifference(native, compat);
    assert.equal(measured.status, "measured");
    assert.deepEqual(measured.metrics, {
      changedPixels: report.difference.changedPixels,
      totalPixels: report.difference.totalPixels,
      changedRatio: report.difference.changedRatio,
      maxChannelDelta: report.difference.maxChannelDelta,
      differenceBounds: report.difference.differenceBounds,
    });
    const image = diffPixels(
      normalizePixels(native),
      normalizePixels(compat),
    ).image;
    const browserImage = await page.evaluate(() => {
      const canvas = document.querySelector(".live-diff-canvas");
      return [
        ...canvas
          .getContext("2d")
          .getImageData(0, 0, canvas.width, canvas.height).data,
      ];
    });
    assert.deepEqual(browserImage, [...image]);
  });

  await check("分屏、重叠、比例、背景不改变指标", async () => {
    await select("text.render.cjk");
    const terminal = await waitTerminal();
    assert.equal(terminal.stage, "completed", terminal.error?.reason);
    const before = await feedback();
    const session = terminal.sessionId;
    const bounds = async () =>
      page.locator(".live-canvas-slot iframe").evaluateAll((frames) =>
        frames.map((frame) => {
          const rect = frame.getBoundingClientRect();
          return {
            side: frame.dataset.side,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        }),
      );
    const overlay = await bounds();
    assert.equal(overlay[0].x, overlay[1].x);
    assert.equal(overlay[0].y, overlay[1].y);
    assert.equal(overlay[0].width, overlay[1].width);
    await page.screenshot({ path: `${output}/overlay-aligned.png` });
    for (const label of ["分屏", "白底", "黑底", "1:1", "适应窗口"])
      await page.getByRole("button", { name: label, exact: true }).click();
    await page.locator("input[type=range]").fill("0");
    await page.locator("input[type=range]").fill("100");
    assert.equal((await state()).sessionId, session);
    assert.deepEqual((await feedback()).difference, before.difference);
    const split = await bounds();
    assert.equal(split[0].width, split[1].width);
    assert.equal(split[0].height, split[1].height);
    await page.getByRole("button", { name: "重叠", exact: true }).click();
    await page.locator("input[type=range]").fill("50");
  });

  await check("控件焦点、首尾与 iframe 快捷键", async () => {
    await page.locator(".live-case-select").focus();
    const focused = (await state()).caseId;
    await page.keyboard.press("ArrowDown");
    assert.equal((await state()).caseId, focused);
    await page.locator(".live-case-select").blur();
    await page.keyboard.press("ArrowDown");
    const moved = (await state()).caseId;
    assert.notEqual(moved, focused);
    await page.keyboard.press("v");
    assert.equal((await state()).display.mode, "split");
    await page.locator(".live-case-select").selectOption({ index: 0 });
    await page.locator(".live-case-select").blur();
    await page.keyboard.press("ArrowUp");
    assert.equal((await state()).caseId, server.catalog[0].id);
    await waitTerminal();
    await page.evaluate(() => document.querySelector("iframe").focus());
    await page.keyboard.press("v");
    await page.waitForFunction(
      async () =>
        (await window.__liveTestPage).coordinator.state.display.mode ===
        "overlay",
    );
    const before = (await state()).caseId;
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction(
      (id) => window.__liveCoordinator.state.caseId !== id,
      before,
    );
    assert.notEqual((await state()).caseId, before);
  });

  await check("快切、重跑、晚到消息与资源销毁", async () => {
    await page.evaluate(() => document.activeElement.blur());
    for (const id of [
      "context.fillRect.render",
      "text.render.cjk",
      "context.fillRect.render",
    ]) {
      await page.selectOption(".live-case-select", id);
      await page.waitForTimeout(20);
    }
    await page.click(".live-actions button:nth-child(1)");
    await page.click(".live-actions button:nth-child(1)");
    const current = await waitTerminal();
    assert.equal(current.caseId, "context.fillRect.render");
    const previous = current.sessionId;
    await page.evaluate(async (sessionId) => {
      const { coordinator } = await window.__liveTestPage;
      for (const side of ["native", "compat"])
        coordinator.receive(
          {
            type: "completed",
            sessionId,
            side,
            pixels: { width: 1, height: 1, pixels: new Uint8Array(4) },
          },
          null,
        );
    }, previous);
    assert.equal((await state()).sessionId, previous);
    await page.waitForFunction(
      () => document.querySelectorAll("div[data-session-id]").length === 2,
    );
    const resources = await page.evaluate(() => ({
      audit: {
        iframeCreated: window.__liveAudit.iframeCreated,
        iframeDisposed: window.__liveAudit.iframeDisposed,
        iframeResourcesDisposed: window.__liveAudit.iframeResourcesDisposed,
        peakFrames: window.__liveAudit.peakFrames,
      },
      frames: document.querySelectorAll("iframe").length,
      hosts: document.querySelectorAll("div[data-session-id]").length,
    }));
    assert.equal(resources.frames, 2);
    assert.equal(resources.hosts, 2);
    assert.equal(
      resources.audit.iframeDisposed,
      resources.audit.iframeCreated - 2,
    );
    await page.click(".live-actions button:nth-child(1)");
    assert.notEqual((await state()).sessionId, previous);
    await waitTerminal();
    return resources;
  });

  await check("连续完成的轮次均确认显式资源清理", async () => {
    await page.reload();
    await select("context.fillRect.render");
    for (let index = 0; index < 6; index += 1) {
      assert.equal((await waitTerminal()).stage, "completed");
      await page.click(".live-actions button:nth-child(1)");
      await page.waitForFunction(
        (count) => window.__liveAudit.iframeResourcesDisposed >= count,
        index * 2 + 2,
      );
    }
    await waitTerminal();
    const audit = await page.evaluate(() => ({
      created: window.__liveAudit.iframeCreated,
      disposed: window.__liveAudit.iframeResourcesDisposed,
      frames: document.querySelectorAll("iframe").length,
      hosts: document.querySelectorAll("div[data-session-id]").length,
    }));
    assert.equal(audit.disposed, audit.created - 2);
    assert.equal(audit.frames, 2);
    assert.equal(audit.hosts, 2);
    return audit;
  });

  await check("复制 ID、成功反馈与失败提示", async () => {
    await page.getByRole("button", { name: "复制 ID", exact: true }).click();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      "context.fillRect.render",
    );
    await page
      .getByRole("button", { name: "复制反馈上下文", exact: true })
      .click();
    const copied = JSON.parse(
      await page.evaluate(() => navigator.clipboard.readText()),
    );
    assert.deepEqual(Object.keys(copied), ["caseId", "browser", "difference"]);
    assert.equal(copied.difference.status, "measured");
    assert.equal(copied.browser.fingerprintingProtection, "not-tested");
    await page.evaluate(() => {
      navigator.clipboard.writeText = () =>
        Promise.reject(new Error("injected-copy-failure"));
    });
    await page
      .getByRole("button", { name: "复制反馈上下文", exact: true })
      .click();
    assert.match(
      await page.locator(".live-notice").textContent(),
      /injected-copy-failure/,
    );
  });

  for (const kind of ["prepare", "run", "sample"]) {
    await check(`${kind} 阶段失败、反馈、清理与恢复`, async () => {
      await context.close();
      context = await browser.newContext({
        viewport: { width: 1200, height: 900 },
        deviceScaleFactor: 1,
      });
      page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on("pageerror", (error) => browserErrors.push(error.message));
      if (kind === "prepare")
        await page.route("**/.build/test/cases/rect/fill.case.js*", (route) =>
          route.abort("failed"),
        );
      if (kind === "run")
        await page.route(
          "**/.build/test/cases/rect/fill.case.js*",
          async (route) => {
            const response = await route.fetch();
            await route.fulfill({
              response,
              body: (await response.text()).replace(
                "run(a) {",
                'run(a) { throw new Error("injected-run-failure");',
              ),
            });
          },
        );
      if (kind === "sample")
        await page.addInitScript(() => {
          CanvasRenderingContext2D.prototype.getImageData = () => {
            throw new Error("injected-sample-failure");
          };
        });
      await page.goto(`${server.url}/?testController=1`);
      await page.waitForFunction(() => window.__liveTestPage !== undefined);
      await page.evaluate(async () => {
        window.__liveCoordinator = (await window.__liveTestPage).coordinator;
      });
      if (kind !== "sample") await select("context.fillRect.render");
      const failed = await waitTerminal();
      assert.equal(failed.stage, "failed");
      assert.match(
        failed.error.reason,
        kind === "prepare"
          ? /Failed to fetch dynamically imported module/
          : new RegExp(`injected-${kind}-failure`),
      );
      assert.equal(failed.difference, null);
      assert.equal((await feedback()).difference.status, "failed");
      assert.equal((await sampleDifference()).width, 0);
      await page.waitForFunction(
        () => document.querySelectorAll("iframe").length === 0,
      );
      await page.unrouteAll();
      if (kind === "sample") {
        // The sampling patch survives reloads in the same context. Isolate recovery.
        await context.close();
        context = await browser.newContext({
          viewport: { width: 1200, height: 900 },
          deviceScaleFactor: 1,
        });
        page = await context.newPage();
        page.setDefaultTimeout(15000);
        page.on("pageerror", (error) => browserErrors.push(error.message));
        await page.goto(`${server.url}/?testController=1`);
      } else {
        await page.reload();
      }
      await select("context.fillRect.render");
      assert.equal((await waitTerminal()).stage, "completed");
    });
  }

  await check("页面销毁释放轮次和界面监听", async () => {
    const result = await page.evaluate(async () => {
      const live = await window.__liveTestPage;
      await live.dispose();
      return {
        frames: document.querySelectorAll("iframe").length,
        children: document.querySelector("#app").childElementCount,
        state: live.coordinator.state.stage,
      };
    });
    assert.equal(result.frames, 0);
    assert.equal(result.children, 0);
    assert.equal(result.state, "idle");
  });

  await check("窄窗口布局与真实画面截图", async () => {
    await page.reload();
    await select("text.render.cjk");
    const terminal = await waitTerminal();
    assert.equal(terminal.stage, "completed", terminal.error?.reason);
    await page.setViewportSize({ width: 640, height: 780 });
    await page.getByRole("button", { name: "分屏", exact: true }).click();
    await page.screenshot({
      path: `${output}/narrow-split.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "重叠", exact: true }).click();
    await page.getByRole("button", { name: "1:1", exact: true }).click();
    await page.screenshot({
      path: `${output}/narrow-overlay-actual.png`,
      fullPage: true,
    });
  });
} finally {
  await context.close();
  await browser.close();
  await server.close();
}

const report = {
  scope: "live-tool-infrastructure",
  compatibilityAccepted: false,
  browserVersion: browser.version(),
  coverage,
  failures,
  browserErrors,
  failedRequests,
};
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
assert.deepEqual(browserErrors, []);
assert.deepEqual(failedRequests, []);
