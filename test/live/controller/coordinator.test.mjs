import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createLiveServer } from "../../../scripts/live-server.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const browserAvailable = existsSync(chromium.executablePath());
const browserTest = browserAvailable
  ? test
  : (name, fn) => test.skip(`${name} [Chromium 未安装]`, fn);

test("协调器浏览器回归环境就绪", () => {
  assert.ok(browserAvailable, "Playwright Chromium 未安装");
});

async function launch(t, path = "/") {
  const server = await createLiveServer({ root });
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await server.close();
  });
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error("[coordinator]", error));
  await page.goto(`${server.url}${path}`);
  await page.waitForFunction(
    () => document.querySelectorAll("iframe").length >= 2,
  );
  return { page, server };
}

const completed = () =>
  document.querySelector(".live-stage-badge[data-side=native]").dataset
    .stage === "completed" &&
  document.querySelector(".live-stage-badge[data-side=compat]").dataset
    .stage === "completed";

browserTest("真实双 iframe 准备屏障、共同起跑与最终量测", async (t) => {
  const { page } = await launch(t, "/?testController=1");
  await page.waitForFunction(completed);
  const result = await page.evaluate(async () => {
    const frames = [...document.querySelectorAll(".live-canvas-slot iframe")];
    const stats = document.querySelector(".live-diff-stats").textContent;
    const feedbackButton = document.querySelector(
      ".live-actions button:nth-of-type(3)",
    );
    return {
      count: frames.length,
      sides: frames.map((frame) => frame.dataset.side),
      uniqueWindows: new Set(frames.map((frame) => frame.contentWindow)).size,
      stats,
      feedbackEnabled: !feedbackButton.disabled,
      noFocusSteal: !frames.includes(document.activeElement),
      parentRandomNative: Math.random !== frames[0].contentWindow.Math.random,
    };
  });
  assert.equal(result.count, 2);
  assert.deepEqual(result.sides.sort(), ["compat", "native"]);
  assert.equal(result.uniqueWindows, 2);
  assert.match(result.stats, /差异像素 \d+ \/ 1024/);
  const difference = await page.evaluate(() => {
    const canvas = document.querySelector(".live-diff-canvas");
    const pixels = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height).data;
    return {
      width: canvas.width,
      height: canvas.height,
      opaque: [...pixels].filter(
        (_, index) => index % 4 === 3 && pixels[index] === 255,
      ).length,
      placeholder: Boolean(document.querySelector(".live-diff-placeholder")),
    };
  });
  assert.equal(difference.width, 32);
  assert.equal(difference.height, 32);
  assert.equal(difference.opaque, 0);
  assert.equal(difference.placeholder, false);
  assert.equal(result.feedbackEnabled, true);
  assert.equal(result.noFocusSteal, true);
  assert.equal(result.parentRandomNative, true);
  const origin = new URL(page.url()).origin;
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin,
  });
  await page.click(".live-actions button:nth-of-type(3)");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const expected = await page.evaluate(async () => {
    const { coordinator } = await window.__liveTestPage;
    return JSON.stringify(coordinator.feedback(), null, 2);
  });
  assert.equal(copied, expected);
});

browserTest(
  "轮次/侧别/来源与阶段校验；晚到消息和重复 error 幂等",
  async (t) => {
    const { page } = await launch(t);
    await page.evaluate(async () => {
      const { createCoordinator } = await import(
        "/dist/live/controller/coordinator.js"
      );
      const assert = (condition, message) => {
        if (!condition) throw new Error(message);
      };
      const root = document.createElement("div");
      document.body.append(root);
      const frames = [];
      const posts = [];
      const coordinator = createCoordinator({
        cases: [{ id: "case.a" }, { id: "case.b" }],
        timeouts: { prepare: 5000, run: 5000 },
        cleanupTimeout: 5,
        measure: () => ({
          image: new Uint8Array(4),
          metrics: {
            totalPixels: 1,
            changedPixels: 0,
            changedRatio: 0,
            maxChannelDelta: 0,
            differenceBounds: null,
          },
        }),
        createFrame(sessionId, side) {
          const element = document.createElement("iframe");
          root.append(element);
          const frame = {
            element,
            post(message) {
              posts.push({ sessionId, side, ...message });
            },
          };
          frames.push({ sessionId, side, frame });
          return frame;
        },
      });
      coordinator.attachCanvas(document.createElement("div"), "native");
      coordinator.attachCanvas(document.createElement("div"), "compat");
      const currentFrames = () => {
        const native = frames.findLast(
          (item) =>
            item.sessionId === coordinator.state.sessionId &&
            item.side === "native",
        );
        const compat = frames.findLast(
          (item) =>
            item.sessionId === coordinator.state.sessionId &&
            item.side === "compat",
        );
        assert(
          native && compat,
          `missing current frames: ${JSON.stringify({ state: coordinator.state, frames })}`,
        );
        return { native: native.frame, compat: compat.frame };
      };
      const send = (side, message) =>
        coordinator.receive(
          { sessionId: coordinator.state.sessionId, side, ...message },
          currentFrames()[side].element.contentWindow,
        );
      coordinator.dispatch({ type: "select-case", caseId: "case.a" });
      const firstId = coordinator.state.sessionId;
      const nativeHost = currentFrames().native.element.parentElement;
      const nativeWindow = currentFrames().native.element.contentWindow;
      const movedSlot = document.createElement("div");
      root.append(movedSlot);
      let reattachError = null;
      try {
        coordinator.attachCanvas(movedSlot, "native");
      } catch (error) {
        reattachError = error;
      }
      assert(
        reattachError?.message === "active-runner-reattach" &&
          currentFrames().native.element.parentElement === nativeHost &&
          currentFrames().native.element.contentWindow === nativeWindow,
        "attachCanvas moved active iframe",
      );
      send("native", { type: "ready" });
      assert(
        posts.every((post) => post.type !== "start"),
        "early native start",
      );
      coordinator.receive(
        { type: "ready", sessionId: firstId, side: "compat" },
        window,
      );
      assert(
        posts.every((post) => post.type !== "start"),
        "wrong source accepted",
      );
      send("compat", { type: "ready" });
      assert(
        posts.filter((post) => post.type === "start").length === 2,
        "no joint start",
      );
      send("native", {
        type: "error",
        stage: "running",
        reason: "first-error",
      });
      const reason = coordinator.state.error.reason;
      send("native", {
        type: "error",
        stage: "running",
        reason: "duplicate-error",
      });
      assert(
        coordinator.state.error.reason === reason,
        "duplicate error changed state",
      );
      coordinator.dispatch({ type: "select-case", caseId: "case.b" });
      coordinator.dispatch({ type: "select-case", caseId: "case.a" });
      const latestId = coordinator.state.sessionId;
      coordinator.receive(
        { type: "ready", sessionId: firstId, side: "native" },
        frames[0].frame.element.contentWindow,
      );
      coordinator.receive(
        {
          type: "error",
          sessionId: firstId,
          side: "native",
          stage: "running",
          reason: "late-error",
        },
        frames[0].frame.element.contentWindow,
      );
      assert(
        coordinator.state.sessionId === latestId,
        "old message changed session",
      );
      assert(!coordinator.state.error, "late error polluted latest session");
      coordinator.receive(
        {
          type: "completed",
          sessionId: firstId,
          side: "native",
          pixels: { width: 1, height: 1, pixels: new Uint8Array(4) },
        },
        frames[0].frame.element.contentWindow,
      );
      assert(
        coordinator.state.sessionId === latestId &&
          coordinator.state.sides.native === "preparing",
        "old completed polluted latest session",
      );
      coordinator.receive(
        {
          type: "completed",
          sessionId: firstId,
          side: "native",
          pixels: { width: 1, height: 1, pixels: new Uint8Array(4) },
        },
        currentFrames().native.element.contentWindow,
      );
      assert(
        coordinator.state.sides.native === "preparing",
        "current source with old completed session polluted latest session",
      );
      send("native", { type: "ready" });
      send("native", {
        type: "completed",
        pixels: { width: 1, height: 1, pixels: new Uint8Array(4) },
      });
      assert(
        coordinator.state.sides.native === "ready",
        "out-of-stage completed accepted",
      );
      send("compat", { type: "ready" });
      const pixels = { width: 1, height: 1, pixels: new Uint8Array(4) };
      send("native", { type: "completed", pixels });
      assert(
        coordinator.state.stage === "running",
        "measured before both completed",
      );
      send("compat", { type: "completed", pixels });
      assert(
        coordinator.state.stage === "completed",
        "both completed not measured",
      );
      let completedReattachError = null;
      try {
        coordinator.attachCanvas(document.createElement("div"), "native");
      } catch (error) {
        completedReattachError = error;
      }
      assert(
        completedReattachError?.message === "active-runner-reattach",
        "completed runner reattached",
      );
      assert(
        coordinator.feedback().difference.status === "measured",
        "feedback not serialized",
      );
      const completedId = coordinator.state.sessionId;
      coordinator.dispatch({ type: "rerun" });
      assert(
        coordinator.state.sessionId !== completedId,
        "rerun reused session",
      );
      assert(
        !coordinator.state.difference && !coordinator.state.error,
        "rerun retained result",
      );
      await coordinator.dispose();
      root.remove();
    });
  },
);

browserTest("阶段超时、取样失败和清理诊断都终止整轮", async (t) => {
  const { page } = await launch(t);
  await page.evaluate(async () => {
    const { createCoordinator } = await import(
      "/dist/live/controller/coordinator.js"
    );
    const assert = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    async function scenario(kind) {
      const root = document.createElement("div");
      const slot = document.createElement("div");
      root.append(slot);
      document.body.append(root);
      const frames = {};
      const coordinator = createCoordinator({
        cases: [{ id: "case.a" }],
        timeouts: { prepare: 20, run: 20 },
        cleanupTimeout: 5,
        createFrame(sessionId, side) {
          const element = document.createElement("iframe");
          root.append(element);
          frames[side] = element;
          return {
            element,
            post(message) {
              if (
                kind === "start" &&
                side === "compat" &&
                message.type === "start"
              )
                throw new Error("start-post-failed");
            },
          };
        },
      });
      coordinator.attachCanvas(slot, "native");
      coordinator.dispatch({ type: "select-case", caseId: "case.a" });
      const send = (side, message) =>
        coordinator.receive(
          { sessionId: coordinator.state.sessionId, side, ...message },
          frames[side].contentWindow,
        );
      if (kind !== "prepare") {
        send("native", { type: "ready" });
        send("compat", { type: "ready" });
      }
      if (kind === "sample") {
        send("native", {
          type: "completed",
          pixels: { width: 1, height: 1, pixels: new Uint8Array(4) },
        });
        send("compat", {
          type: "completed",
          pixels: { width: 1, height: 1, pixels: new Uint8Array(1) },
        });
      }
      if (kind === "cleanup") {
        send("native", {
          type: "error",
          stage: "running",
          reason: "original-failure",
        });
        send("native", {
          type: "error",
          stage: "disposing",
          reason: "cleanup-failure",
        });
        send("native", { type: "disposed" });
        send("compat", { type: "disposed" });
      }
      if (kind === "prepare" || kind === "run" || kind === "start")
        await new Promise((resolve) => {
          const deadline = Date.now() + 1000;
          const poll = () => {
            if (coordinator.state.stage === "failed") resolve();
            else if (Date.now() >= deadline) resolve();
            else setTimeout(poll, 5);
          };
          poll();
        });
      else await new Promise((resolve) => setTimeout(resolve, 25));
      await new Promise((resolve) => {
        const deadline = Date.now() + 1000;
        const poll = () => {
          if (!root.querySelector("iframe") || Date.now() >= deadline)
            resolve();
          else setTimeout(poll, 5);
        };
        poll();
      });
      const result = {
        kind,
        stage: coordinator.state.stage,
        error: coordinator.state.error?.reason,
        frames: root.querySelectorAll("iframe").length,
        hosts: root.querySelectorAll("div[data-session-id]").length,
        difference: coordinator.state.difference,
      };
      if (kind === "cleanup") {
        coordinator.attachCanvas(slot, "native");
        assert(
          root.querySelectorAll("iframe").length === 0 &&
            root.querySelectorAll("div[data-session-id]").length === 0,
          "disposed failure host reattached",
        );
      }
      await coordinator.dispose();
      root.remove();
      return result;
    }
    const results = [];
    for (const kind of ["prepare", "run", "start", "sample", "cleanup"])
      results.push(await scenario(kind));
    for (const result of results) {
      assert(result.stage === "failed", `${result.kind}: no failed state`);
      assert(result.frames === 0, `${result.kind}: iframe retained`);
      assert(result.hosts === 0, `${result.kind}: host retained`);
      assert(result.difference === null, `${result.kind}: difference retained`);
    }
    assert(
      results[0].error.includes("prepare-timeout"),
      "prepare timeout missing",
    );
    assert(
      results[1].error.includes("run-timeout"),
      `run timeout missing: ${JSON.stringify(results)}`,
    );
    assert(
      results[2].error.includes("start-post-failed"),
      "start post failure missing",
    );
    assert(
      results[3].error.includes("incomplete-data"),
      "sample failure missing",
    );
    assert(
      results[4].error.includes("original-failure"),
      "original failure lost",
    );
    assert(
      results[4].error.includes("cleanup-failure"),
      "cleanup diagnostic lost",
    );
  });
});

browserTest("第二侧创建失败时释放第一侧且不留下孤儿 frame", async (t) => {
  const { page } = await launch(t);
  await page.evaluate(async () => {
    const { createCoordinator } = await import(
      "/dist/live/controller/coordinator.js"
    );
    const root = document.createElement("div");
    const slot = document.createElement("div");
    root.append(slot);
    document.body.append(root);
    const first = document.createElement("iframe");
    let disposeCount = 0;
    const coordinator = createCoordinator({
      cases: [{ id: "case.a" }],
      timeouts: { prepare: 1000, run: 1000 },
      cleanupTimeout: 5,
      createFrame(_sessionId, side) {
        if (side === "compat") throw new Error("frame-creation-failed");
        return {
          element: first,
          post(message) {
            if (message.type === "dispose") disposeCount += 1;
          },
        };
      },
    });
    coordinator.attachCanvas(slot, "native");
    coordinator.attachCanvas(document.createElement("div"), "compat");
    coordinator.dispatch({ type: "select-case", caseId: "case.a" });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const result = {
      stage: coordinator.state.stage,
      side: coordinator.state.error?.side,
      disposeCount,
      connected: first.isConnected,
      feedback: coordinator.feedback()?.difference.status,
      sides: { ...coordinator.state.sides },
    };
    await coordinator.dispose();
    root.remove();
    if (
      result.stage !== "failed" ||
      result.side !== "compat" ||
      result.sides.compat !== "failed" ||
      result.sides.native !== "disposed" ||
      result.disposeCount !== 1 ||
      result.connected ||
      result.feedback !== "failed"
    )
      throw new Error(JSON.stringify(result));
  });
});

browserTest(
  "真实 A→B→A 与连续重跑立即更换轮次并移除旧 iframe 和 host",
  async (t) => {
    const { page } = await launch(t);
    await page.waitForFunction(completed);
    const first = await page.evaluate(() => ({
      id: document.querySelector("iframe").dataset.sessionId,
      frames: [...document.querySelectorAll("iframe")],
    }));
    await page.selectOption(".live-case-select", "context.clearRect.render");
    await page.waitForFunction(
      (id) =>
        document.querySelector("iframe")?.dataset.sessionId !== id &&
        document.querySelectorAll("iframe").length === 2,
      first.id,
    );
    const second = await page.evaluate(
      () => document.querySelector("iframe").dataset.sessionId,
    );
    await page.selectOption(".live-case-select", "context.fillRect.render");
    await page.waitForFunction(
      (id) => document.querySelector("iframe")?.dataset.sessionId !== id,
      second,
    );
    await page.waitForFunction(completed);
    const third = await page.evaluate(
      () => document.querySelector("iframe").dataset.sessionId,
    );
    await page.click(".live-actions button:nth-of-type(1)");
    await page.waitForFunction(
      (id) => document.querySelector("iframe")?.dataset.sessionId !== id,
      third,
    );
    await page.click(".live-actions button:nth-of-type(1)");
    await page.waitForFunction(completed);
    await page.waitForFunction(
      () =>
        document.querySelectorAll("iframe").length === 2 &&
        document.querySelectorAll("div[data-session-id]").length === 2,
    );
    assert.equal(await page.locator("iframe").count(), 2);
    assert.equal(await page.locator("div[data-session-id]").count(), 2);
    assert.equal(
      await page.evaluate(() => document.querySelector("iframe").isConnected),
      true,
    );
    // 所有旧文档均已被移除；旧消息不再可能引用当前 session。
    assert.ok(first.frames.every((frame) => !frame.isConnected));
  },
);

browserTest("真实 iframe 的显式 dispose、跨 realm 执行与快捷键", async (t) => {
  const { page } = await launch(t);
  await page.waitForFunction(completed);
  const caseId = "image.offscreen-cross-realm";
  await page.selectOption(".live-case-select", caseId);
  await page.waitForFunction(
    () => document.querySelectorAll("iframe").length === 2,
  );
  await page.waitForFunction(completed);
  // iframe 不可聚焦/点击，父页面仍拥有导航与模式快捷键。
  const before = await page.locator(".live-case-select").inputValue();
  await page.keyboard.press("v");
  await page.keyboard.press("ArrowDown");
  assert.notEqual(await page.locator(".live-case-select").inputValue(), before);
  await page.selectOption(".live-case-select", caseId);
  await page.waitForFunction(
    () => document.querySelectorAll("iframe").length === 2,
  );
  await page.waitForFunction(completed);

  // 只包装真实 RunnerSession.prototype.dispose 计数，然后调用原实现。
  // 这直接证明父协调器触发了子执行器的显式清理，不引入私有资源接口假设。
  await page.evaluate(async () => {
    window.__liveDisposeCalls = [];
    for (const frame of document.querySelectorAll("iframe")) {
      const child = frame.contentWindow;
      const { RunnerSession } = await child.eval(
        'import("/dist/live/runner/executor.js")',
      );
      const original = RunnerSession.prototype.dispose;
      const sessionId = frame.dataset.sessionId;
      RunnerSession.prototype.dispose = function (...args) {
        const promise = original.apply(this, args);
        if (this.__liveDisposeObserved) return promise;
        this.__liveDisposeObserved = true;
        return promise.then(() => {
          window.__liveDisposeCalls.push({
            sessionId,
            connected: frame.isConnected,
            canvases: child.document.querySelectorAll("canvas").length,
            frames: child.document.querySelectorAll("iframe").length,
          });
        });
      };
    }
  });
  const oldId = await page
    .locator("iframe")
    .first()
    .getAttribute("data-session-id");
  await page.click(".live-actions button:nth-of-type(1)");
  await page.waitForFunction(
    (id) =>
      window.__liveDisposeCalls.filter((item) => item.sessionId === id)
        .length >= 2 &&
      [...document.querySelectorAll("iframe")].every(
        (frame) => frame.dataset.sessionId !== id,
      ),
    oldId,
    { timeout: 5000 },
  );
  assert.notEqual(
    await page.locator("iframe").first().getAttribute("data-session-id"),
    oldId,
  );
  const disposal = await page.evaluate(
    (id) => window.__liveDisposeCalls.filter((item) => item.sessionId === id),
    oldId,
  );
  assert.equal(disposal.length, 2);
  for (const item of disposal) {
    assert.equal(item.connected, true);
    assert.equal(item.canvases, 0);
    assert.equal(item.frames, 0);
  }
});

browserTest("准备超时、失败终态与手动重试；不自动重跑", async (t) => {
  const { page } = await launch(t, "/?prepare=1&run=8000");
  await page.waitForFunction(() =>
    document
      .querySelector(".live-error-reason")
      .textContent.includes("prepare-timeout"),
  );
  assert.match(await page.textContent(".live-error-stage"), /准备中/);
  await page.waitForFunction(
    () => document.querySelectorAll("iframe").length === 0,
  );
  assert.equal(await page.locator("iframe").count(), 0);
  assert.match(await page.textContent(".live-diff-empty"), /本轮失败/);
  await page.click(".live-actions button:nth-of-type(1)");
  assert.equal(await page.locator("iframe").count(), 2);
});

browserTest("页面 dispose 断开父监听、observer 与 iframe", async (t) => {
  const { page } = await launch(t);
  await page.waitForFunction(completed);
  const result = await page.evaluate(async () => {
    const { startLivePage } = await import("/dist/live/controller/page.js");
    const root = document.createElement("div");
    document.body.append(root);
    const app = await startLivePage(root);
    const oldSource = root.querySelector("iframe").contentWindow;
    const oldId = root.querySelector("iframe").dataset.sessionId;
    await app.dispose();
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: location.origin,
        source: oldSource,
        data: { type: "ready", sessionId: oldId, side: "native" },
      }),
    );
    return {
      frames: root.querySelectorAll("iframe").length,
      hosts: root.querySelectorAll("div[data-session-id]").length,
      observer: app.view.resizeObserver,
      state: app.coordinator.state.stage,
    };
  });
  assert.equal(result.frames, 0);
  assert.equal(result.hosts, 0);
  assert.equal(result.observer, null);
  assert.equal(result.state, "idle");
});

browserTest("本地目录来自真实投影，路径与协议受约束", async (t) => {
  const { page } = await launch(t);
  const base = page.url();
  const catalog = await (await page.request.get(`${base}api/catalog`)).json();
  assert.ok(catalog.some((entry) => entry.id === "context.fillRect.render"));
  assert.ok(
    catalog.every((entry) =>
      entry.caseModuleUrl.startsWith("/.build/test/cases/"),
    ),
  );
  assert.ok(!catalog.some((entry) => entry.id.startsWith("ACC-05.dispose")));
  assert.equal((await page.request.get(`${base}package.json`)).status(), 404);
  assert.equal(
    (await page.request.get(`${base}test/live/controller/page.ts`)).status(),
    404,
  );
  assert.equal((await page.request.post(`${base}api/catalog`)).status(), 405);
});
