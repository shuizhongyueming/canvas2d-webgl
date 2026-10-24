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

/**
 * 启动本地服务与页面，注入 stub 状态机；返回操作句柄。
 * 失败路径必须关闭已开资源：chromium.launch 失败时 t.after 尚未注册的
 * 写法会让并发失败测试遗留 server 句柄，事件循环悬挂（CI 曾因此 6h
 * 超时被取消）。这里把清理集中到一个始终注册的 after 钩子。
 */
async function launch(t) {
  console.log(`[view.test] launch start: ${t.name}`);
  let server = null;
  let browser = null;
  t.after(async () => {
    if (browser) await browser.close();
    if (server) await server.close();
  });
  server = await serve(root);
  console.log(`[view.test] server up: ${server.url}`);
  browser = await chromium.launch({ headless: true });
  console.log("[view.test] chromium launched");
  // 把浏览器与服务输出接到 Node 日志：CI 挂起时能看到进度。
  browser.on("disconnected", () =>
    console.log("[view.test] browser disconnected"),
  );
  const page = await browser.newPage();
  page.on("console", (msg) => console.log("[view.test][page]", msg.text()));
  page.on("pageerror", (error) =>
    console.log("[view.test][pageerror]", error.message),
  );

  await page.goto(`${server.url}/`, { waitUntil: "domcontentloaded" });
  console.log("[view.test] page ready");
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

test("非终态拒绝复制反馈；无选中用例拒绝复制 ID", async (t) => {
  const { page, setState } = await launch(t);
  // running 状态：copyFeedback 直接拒绝，不调用剪贴板。
  await setState({
    ...selected("case.alpha", "running"),
    sides: { native: "running", compat: "running" },
  });
  const rejected = await page.evaluate(async () => {
    const before = window.__live.copies.length;
    const ok = await window.__live.view.copyFeedback({
      protocolVersion: 1,
      status: "failed",
      side: null,
      stage: "running",
      reason: "stale",
    });
    return { ok, wrote: window.__live.copies.length > before };
  });
  assert.deepEqual(rejected, { ok: false, wrote: false });

  // 无用例：copyCaseId 拒绝；复制按钮禁用。
  await setState({
    sessionId: null,
    caseId: null,
    stage: "idle",
    sides: { native: "idle", compat: "idle" },
    difference: null,
    error: null,
  });
  const noCase = await page.evaluate(async () => {
    const before = window.__live.copies.length;
    const ok = await window.__live.view.copyCaseId();
    return { ok, wrote: window.__live.copies.length > before };
  });
  assert.deepEqual(noCase, { ok: false, wrote: false });
  assert.equal(
    await page.locator(".live-actions button:nth-of-type(2)").isDisabled(),
    true,
  );
  assert.equal(
    await page.locator(".live-actions button:nth-of-type(3)").isDisabled(),
    true,
  );
});

test("按钮点击派发 copy 事件，由 controller 回调查询复制（用户路径）", async (t) => {
  const { page, setState, events } = await launch(t);
  await setState(selected("case.beta"));
  await page.click(".live-actions button:nth-of-type(2)");
  assert.deepEqual(await events(), [{ type: "copy-case-id" }]);
  // 模拟 controller 收到事件后回调视图复制方法。
  const copies = await page.evaluate(async () => {
    await window.__live.view.copyCaseId();
    return window.__live.copies;
  });
  assert.deepEqual(copies, ["case.beta"]);

  await page.click(".live-actions button:nth-of-type(3)");
  assert.deepEqual(await events(), [{ type: "copy-feedback" }]);
});

test("重跑按钮派发 rerun；无用例时禁用", async (t) => {
  const { page, setState, events } = await launch(t);
  assert.equal(
    await page.locator(".live-actions button:nth-of-type(1)").isDisabled(),
    true,
  );
  await setState(selected("case.alpha"));
  await page.click(".live-actions button:nth-of-type(1)");
  assert.deepEqual(await events(), [{ type: "rerun" }]);
});

test("执行中传入 metrics 时视图不提前显示差异（防御）", async (t) => {
  const { page, setState } = await launch(t);
  await setState({
    ...selected("case.alpha", "running"),
    sides: { native: "running", compat: "completed" },
    difference: {
      totalPixels: 100,
      changedPixels: 1,
      changedRatio: 0.01,
      maxChannelDelta: 5,
      differenceBounds: { x: 0, y: 0, width: 1, height: 1 },
    },
  });
  assert.match(await page.textContent(".live-diff-empty"), /等待两侧完成/);
  assert.equal(await page.textContent(".live-diff-stats"), "");
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

test("差异图开关可切换显示；无量测时开关禁用", async (t) => {
  const { page, setState } = await launch(t);
  // 无量测：开关禁用。
  await setState(selected("case.alpha", "running"));
  const toggle = page.locator(".live-diff-toggle");
  assert.equal(await toggle.isDisabled(), true);

  await setState({
    ...selected("case.alpha"),
    difference: {
      totalPixels: 960,
      changedPixels: 1,
      changedRatio: 1 / 960,
      maxChannelDelta: 3,
      differenceBounds: { x: 2, y: 3, width: 1, height: 1 },
    },
  });
  assert.equal(await toggle.isDisabled(), false);
  assert.equal(await toggle.textContent(), "差异图：开");
  assert.equal(await page.locator(".live-diff-image-box").isVisible(), true);

  // 关闭开关：差异图区域隐藏，指标与 bbox 仍显示。
  await toggle.click();
  await page.waitForFunction(
    () => document.querySelector(".live-diff-image-box").hidden,
  );
  assert.equal(await toggle.textContent(), "差异图：关");
  assert.equal(await page.locator(".live-diff-image-box").isVisible(), false);
  assert.match(await page.textContent(".live-diff-stats"), /1 \/ 960/);

  // 再打开。
  await toggle.click();
  await page.waitForFunction(
    () => !document.querySelector(".live-diff-image-box").hidden,
  );
  assert.equal(await page.locator(".live-diff-image-box").isVisible(), true);
});

test("重叠模式两侧画布同位置对齐（原生下层、兼容上层）", async (t) => {
  const { page, setState } = await launch(t);
  await setState({
    ...selected("case.alpha"),
    display: { ...IDLE_STATE.display, mode: "overlay" },
  });
  const rects = await page.evaluate(() => {
    const nativeCanvas = document.querySelector(
      '.live-pane[data-side="native"] canvas',
    );
    const compatCanvas = document.querySelector(
      '.live-pane[data-side="compat"] canvas',
    );
    const native = nativeCanvas.getBoundingClientRect();
    const compat = compatCanvas.getBoundingClientRect();
    return {
      topDelta: Math.abs(native.top - compat.top),
      leftDelta: Math.abs(native.left - compat.left),
      compatAbove:
        nativeCanvas.compareDocumentPosition(compatCanvas) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    };
  });
  assert.equal(rects.topDelta, 0);
  assert.equal(rects.leftDelta, 0);
  // 兼容 pane 在 DOM 中位于原生之后（同透明度下视觉在上层）。
  assert.notEqual(rects.compatAbove, 0);
});

test("fit 模式对重叠整体应用统一缩放因子；1:1 清除内联尺寸", async (t) => {
  const { page, setState } = await launch(t);
  await page.setViewportSize({ width: 300, height: 600 });
  await setState({
    ...selected("case.alpha"),
    display: { ...IDLE_STATE.display, scale: "fit", mode: "overlay" },
  });
  const fitState = await page.evaluate(() => {
    const overlay = document.querySelector(".live-overlay");
    return {
      scale: overlay.style.getPropertyValue("--live-fit-scale"),
      transform: getComputedStyle(overlay).transform,
      width: overlay.style.width,
      height: overlay.style.height,
    };
  });
  // 桩画布 40×24，重叠模式标签不占位；舞台约 280px 宽：因子恰好为 1。
  assert.equal(Number(fitState.scale), 1);
  assert.equal(fitState.transform, "matrix(1, 0, 0, 1, 0, 0)");
  assert.equal(fitState.width, "40px");
  assert.equal(fitState.height, "24px");

  // 分屏：内容宽 = 两栏总宽（40*2+16=96），高度含标签。
  await setState({
    display: { ...IDLE_STATE.display, scale: "fit", mode: "split" },
  });
  const splitState = await page.evaluate(() => {
    const overlay = document.querySelector(".live-overlay");
    return {
      width: overlay.style.width,
      scale: overlay.style.getPropertyValue("--live-fit-scale"),
    };
  });
  assert.equal(splitState.width, "96px");
  assert.equal(Number(splitState.scale), 1);

  // 窄窗口：重叠内容 40px 宽，窗口压到 30px 内容区时按比例缩小。
  await page.setViewportSize({ width: 60, height: 600 });
  await setState({
    display: { ...IDLE_STATE.display, scale: "fit", mode: "overlay" },
  });
  await page.waitForFunction(() => {
    const overlay = document.querySelector(".live-overlay");
    const scale = Number(overlay.style.getPropertyValue("--live-fit-scale"));
    return scale > 0 && scale < 1;
  });
  const shrunk = await page.evaluate(
    () => getComputedStyle(document.querySelector(".live-overlay")).transform,
  );
  assert.match(shrunk, /^matrix\(/);

  // 1:1：缩放因子与内联尺寸全部清除，恢复滚动能力。
  await setState({
    display: { ...IDLE_STATE.display, scale: "actual", mode: "split" },
  });
  const actual = await page.evaluate(() => {
    const overlay = document.querySelector(".live-overlay");
    const inner = document.querySelector(".live-stage-inner");
    return {
      scale: overlay.style.getPropertyValue("--live-fit-scale"),
      width: overlay.style.width,
      height: overlay.style.height,
      innerWidth: inner.style.width,
    };
  });
  assert.deepEqual(actual, {
    scale: "",
    width: "",
    height: "",
    innerWidth: "",
  });
});

test("选中用例展示观察重点", async (t) => {
  const { page, setState } = await launch(t);
  await setState(selected("case.beta"));
  assert.match(await page.textContent(".live-observation"), /观察重点 B/);
});

test("指纹噪声提示可见；完成状态展示 bbox 与差异图占位", async (t) => {
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
  // 逐像素图数据接入前不画伪图：画布保持空，占位文本可见。
  const diffInfo = await page.evaluate(() => {
    const canvas = document.querySelector(".live-diff-canvas");
    const placeholder = document.querySelector(".live-diff-placeholder");
    return [
      canvas.width,
      canvas.height,
      placeholder.textContent,
      placeholder.offsetParent !== null,
    ];
  });
  assert.deepEqual(diffInfo, [
    0,
    0,
    "差异图等待逐像素数据（由量测票 #68 提供）。",
    true,
  ]);
});
