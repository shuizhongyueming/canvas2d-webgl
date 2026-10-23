// 视图层真实浏览器交互回归（issue #70）。
// 桩驱动：宿主与 dispatch 均为测试替身；不声称证明完整执行链路。
import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { serve } from "../../harness/server.mjs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));

const CASES = [
  { id: "case.alpha", observation: "观察重点 A" },
  { id: "case.beta", observation: "观察重点 B" },
  { id: "case.gamma", observation: "观察重点 C" },
];

const IDLE_STATE = {
  sessionId: null,
  caseId: null,
  stage: "idle",
  sides: { native: "idle", compat: "idle" },
  difference: null,
  error: null,
  display: {
    mode: "overlay",
    overlayOpacity: 0.5,
    background: "checker",
    scale: "fit",
  },
};

/** 启动本地服务与页面，注入 stub 状态机；返回操作句柄。 */
async function launch(t) {
  const server = await serve(root);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  t.after(async () => {
    await browser.close();
    await server.close();
  });

  await page.goto(`${server.url}/dist/live/view/view.js`, {
    waitUntil: "domcontentloaded",
  });
  // view.js 是模块文件，直接 goto 不会执行；改为通过模块导入挂载。
  await page.evaluate(
    async ({ cases, idle }) => {
      const module = await import("/dist/live/view/view.js");
      const events = [];
      const copies = [];
      const host = {
        attachCanvas(slot, side) {
          // 桩画布：代替 controller 提供的真实 canvas。
          const canvas = document.createElement("canvas");
          canvas.width = 40;
          canvas.height = 24;
          canvas.dataset.side = side;
          slot.replaceChildren(canvas);
        },
        copyText(text) {
          if (window.__failCopy) {
            return Promise.reject(new Error("clipboard-denied"));
          }
          copies.push(text);
          return Promise.resolve();
        },
        browserInfo: () => ({
          userAgent: "stub-ua",
          language: "zh-CN",
          devicePixelRatio: 2,
        }),
        now: () => Date.now(),
      };
      const rootEl = document.createElement("div");
      document.body.append(rootEl);
      const view = module.createView(
        rootEl,
        (event) => {
          events.push(event);
          window.__onEvent?.(event);
        },
        { cases, host },
      );
      window.__live = { view, events, copies, state: structuredClone(idle) };
      view.render(window.__live.state);
      document.addEventListener("keydown", (event) =>
        view.handleKey(event.key),
      );
    },
    { cases: CASES, idle: IDLE_STATE },
  );

  const setState = (patch) =>
    page.evaluate((partial) => {
      window.__live.state = { ...window.__live.state, ...partial };
      window.__live.view.render(window.__live.state);
    }, patch);
  const events = () => page.evaluate(() => window.__live.events.splice(0));
  const state = (patch) =>
    page.evaluate(
      (partial) =>
        (window.__live.state = {
          ...window.__live.state,
          ...partial,
        }),
      patch,
    );

  return { page, setState, events, state };
}

const selected = (id, stage = "completed") => ({
  sessionId: "s1",
  caseId: id,
  stage,
  sides: { native: stage, compat: stage },
});

test("下拉、按钮与上下键选择一致；首尾停止不循环", async (t) => {
  const { page, setState, events } = await launch(t);
  await setState(selected("case.alpha"));

  // 下拉选择。
  await page.selectOption(".live-case-select", "case.beta");
  assert.deepEqual(await events(), [
    { type: "select-case", caseId: "case.beta" },
  ]);
  await setState(selected("case.beta"));

  // 上一项/下一项按钮。
  await page.click(".live-nav button:nth-of-type(2)");
  assert.deepEqual(await events(), [{ type: "step-case", direction: 1 }]);
  await setState(selected("case.gamma"));
  await page.click(".live-nav button:nth-of-type(1)");
  assert.deepEqual(await events(), [{ type: "step-case", direction: -1 }]);
  await setState(selected("case.alpha"));

  // 键盘：位于第一项时 ArrowUp 不派发；ArrowDown 正常派发。
  await page.keyboard.press("ArrowUp");
  assert.deepEqual(await events(), []);
  await page.keyboard.press("ArrowDown");
  assert.deepEqual(await events(), [{ type: "step-case", direction: 1 }]);
  await setState(selected("case.gamma"));
  // 末项 ArrowDown 停止。
  await page.keyboard.press("ArrowDown");
  assert.deepEqual(await events(), []);
  // 末项下一项按钮禁用。
  assert.equal(
    await page.locator(".live-nav button:nth-of-type(2)").isDisabled(),
    true,
  );
});

test("分屏/重叠按钮与 V 键一致；显示切换不派发重跑事件", async (t) => {
  const { page, setState, events } = await launch(t);
  await setState(selected("case.alpha"));

  await page.click(".live-modes button:nth-of-type(1)");
  assert.deepEqual(await events(), [
    { type: "set-display-mode", mode: "split" },
  ]);
  await setState({ display: { ...IDLE_STATE.display, mode: "split" } });

  await page.keyboard.press("v");
  assert.deepEqual(await events(), [
    { type: "set-display-mode", mode: "overlay" },
  ]);
  // 显示模式事件之外不产生 rerun/select。
  const overlayOpacity = await page.evaluate(
    () =>
      document.querySelector('.live-pane[data-side="compat"]').style.opacity,
  );
  assert.equal(overlayOpacity, "1");
});

test("控件聚焦期间页面级快捷键不触发；滑杆调整透明度", async (t) => {
  const { page, setState, events } = await launch(t);
  await setState(selected("case.alpha"));

  // 聚焦下拉框时 ↑/↓/V 不派发页面事件。
  await page.focus(".live-case-select");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("v");
  assert.deepEqual(await events(), []);

  // 聚焦滑杆时同样不触发快捷键；input 事件派发透明度。
  await page.focus(".live-opacity input[type=range]");
  await page.keyboard.press("v");
  assert.deepEqual(await events(), []);
  await page.evaluate(() => {
    const slider = document.querySelector(".live-opacity input[type=range]");
    slider.value = "25";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.deepEqual(await events(), [
    { type: "set-overlay-opacity", opacity: 0.25 },
  ]);
});

test("透明度/背景/显示比例切换不改变画布 backing 尺寸", async (t) => {
  const { page, setState, events } = await launch(t);
  await setState(selected("case.alpha"));
  const backing = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".live-canvas-slot canvas")].map((c) => [
        c.width,
        c.height,
      ]),
    );
  const before = await backing();

  await setState({
    display: { ...IDLE_STATE.display, overlayOpacity: 0, scale: "actual" },
  });
  assert.deepEqual(await backing(), before);
  await setState({
    display: {
      ...IDLE_STATE.display,
      overlayOpacity: 1,
      background: "black",
      mode: "split",
    },
  });
  assert.deepEqual(await backing(), before);
  assert.deepEqual(await events(), []);
});

test("错误与等待状态清除旧指标；非终态禁用反馈复制", async (t) => {
  const { page, setState } = await launch(t);
  await setState({
    ...selected("case.alpha"),
    difference: {
      totalPixels: 96000,
      changedPixels: 1,
      changedRatio: 1 / 96000,
      maxChannelDelta: 3,
      differenceBounds: { x: 2, y: 3, width: 1, height: 1 },
    },
  });
  assert.equal(
    await page.locator(".live-actions button:nth-of-type(3)").isEnabled(),
    true,
  );
  const stats = await page.textContent(".live-diff-stats");
  assert.match(stats, /1 \/ 96000/);
  assert.match(stats, /小于 0\.01%/);

  // 重新运行进入 running：指标与复制按钮同步清除。
  await setState({
    stage: "running",
    sides: { native: "running", compat: "ready" },
    difference: null,
  });
  assert.equal(
    await page.locator(".live-actions button:nth-of-type(3)").isDisabled(),
    true,
  );
  assert.match(await page.textContent(".live-diff-empty"), /等待两侧完成/);

  // 失败：显示侧别、阶段与原因；反馈复制恢复可用。
  await setState({
    stage: "failed",
    sides: { native: "failed", compat: "disposed" },
    error: { side: "native", stage: "running", reason: "sample-failed" },
  });
  const errorText = await page.textContent(".live-error");
  assert.match(errorText, /原生/);
  assert.match(errorText, /运行中/);
  assert.match(errorText, /sample-failed/);
  assert.match(await page.textContent(".live-diff-empty"), /本轮失败/);
  assert.equal(
    await page.locator(".live-actions button:nth-of-type(3)").isEnabled(),
    true,
  );
});

test("复制 ID 始终可用；复制成功与剪贴板失败均有提示", async (t) => {
  const { page, setState } = await launch(t);
  await setState(selected("case.beta"));

  const copied = await page.evaluate(async () => {
    await window.__live.view.copyCaseId();
    return window.__live.copies;
  });
  assert.deepEqual(copied, ["case.beta"]);
  assert.match(await page.textContent(".live-notice"), /用例 ID 已复制/);

  // 剪贴板失败：提示复制失败，不抛出未处理异常。
  await page.evaluate(async () => {
    window.__failCopy = true;
    await window.__live.view.copyCaseId();
  });
  await page.waitForFunction(() =>
    document.querySelector(".live-notice").textContent.includes("复制失败"),
  );
  assert.match(await page.textContent(".live-notice"), /clipboard-denied/);
});

test("反馈 JSON 只含 caseId、browser、difference；失败状态不带指标", async (t) => {
  const { page, setState } = await launch(t);
  await setState({
    ...selected("case.alpha", "failed"),
    error: { side: null, stage: "preparing", reason: "prepare-timeout" },
  });
  const report = await page.evaluate(async () => {
    const view = window.__live.view;
    await view.copyFeedback({
      protocolVersion: 1,
      status: "failed",
      side: null,
      stage: "preparing",
      reason: "prepare-timeout",
    });
    return JSON.parse(window.__live.copies.at(-1));
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
  assert.equal(report.difference.status, "failed");
  assert.equal(report.difference.changedPixels, undefined);
});

test("指纹噪声提示可见；完成状态展示 bbox 与差异图", async (t) => {
  const { page, setState } = await launch(t);
  assert.match(await page.textContent(".live-fingerprint-note"), /指纹保护/);
  assert.match(await page.textContent(".live-fingerprint-note"), /not-tested/);

  await setState({
    ...selected("case.alpha"),
    difference: {
      totalPixels: 960,
      changedPixels: 4,
      changedRatio: 4 / 960,
      maxChannelDelta: 255,
      differenceBounds: { x: 1, y: 1, width: 2, height: 2 },
    },
  });
  const bounds = await page.textContent(".live-diff-bounds");
  assert.match(bounds, /x=1, y=1/);
  assert.match(bounds, /内部不保证全部不同/);
  const diffSize = await page.evaluate(() => {
    const canvas = document.querySelector(".live-diff-canvas");
    return [canvas.width, canvas.height];
  });
  assert.deepEqual(diffSize, [2, 2]);
});
