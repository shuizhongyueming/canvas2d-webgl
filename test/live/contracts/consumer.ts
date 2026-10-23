/**
 * 契约消费者类型检查（issue #66 验收）。
 * 由 pnpm run check 编译；@ts-expect-error 行必须保持报错，
 * 证明类型检查拒绝缺轮次/侧别消息与成功状态缺像素。
 */
import type {
  ControllerState,
  DisplayClassification,
  FeedbackReport,
  PixelData,
  PreparedExecution,
  RunnerMessage,
} from "./index.js";

const pixels: PixelData = { width: 1, height: 1, pixels: new Uint8Array(4) };

// 合法消息：轮次、侧别齐备。
const ready: RunnerMessage = { type: "ready", sessionId: "s1", side: "native" };
const completed: RunnerMessage = {
  type: "completed",
  sessionId: "s1",
  side: "compat",
  pixels,
};

// @ts-expect-error 缺 sessionId 的消息必须被拒绝。
const missingSession: RunnerMessage = { type: "ready", side: "native" };

// @ts-expect-error 缺 side 的消息必须被拒绝。
const missingSide: RunnerMessage = { type: "ready", sessionId: "s1" };

// @ts-expect-error completed 缺最终像素必须被拒绝。
const completedNoPixels: RunnerMessage = {
  type: "completed",
  sessionId: "s1",
  side: "native",
};

// 缺 pixels 字段的对象不能赋给 PixelData；多行字面量下错误落在 const 行。
// @ts-expect-error 缺 pixels 字段必须被拒绝。
const badPixels: PixelData = {
  width: 1,
  height: 1,
};

// 展示分类：included 必须带非空观察重点字段。
const included: DisplayClassification = {
  status: "included",
  observation: "字形与位置",
};
// @ts-expect-error excluded 缺原因必须被拒绝。
const excluded: DisplayClassification = { status: "excluded" };

// 反馈 JSON：失败状态不携带数值指标。
const failedReport: FeedbackReport = {
  caseId: "example.case",
  browser: {
    userAgent: "ua",
    language: "zh-CN",
    devicePixelRatio: 1,
    fingerprintingProtection: "not-tested",
  },
  difference: {
    protocolVersion: 1,
    status: "failed",
    side: null,
    stage: "running",
    reason: "sample-failed",
  },
};
const failedWithMetrics: FeedbackReport = {
  caseId: "example.case",
  browser: {
    userAgent: "ua",
    language: "zh-CN",
    devicePixelRatio: 1,
    fingerprintingProtection: "not-tested",
  },
  difference: {
    protocolVersion: 1,
    status: "failed",
    side: "native",
    stage: "running",
    reason: "x",
    // @ts-expect-error 失败状态携带数值指标必须被拒绝。
    changedPixels: 1,
  },
};

// 控制器状态：执行中不提前给出最终差异。
const state: ControllerState = {
  sessionId: "s1",
  caseId: "example.case",
  stage: "running",
  sides: { native: "running", compat: "ready" },
  difference: null,
  error: null,
  display: {
    mode: "overlay",
    overlayOpacity: 0.5,
    background: "checker",
    scale: "fit",
  },
};

// prepared execution 所有权：dispose 幂等返回 Promise。
declare const prepared: PreparedExecution;
const disposing: Promise<void> = prepared.dispose();

export {
  badPixels,
  completed,
  completedNoPixels,
  disposing,
  excluded,
  failedReport,
  failedWithMetrics,
  included,
  missingSession,
  missingSide,
  ready,
  state,
};
