/**
 * 复制反馈上下文序列化（issue #68；反馈协议见 #64 resolution）。
 * 顶层仅 caseId、browser、difference；无截图、完整像素数组、
 * commit、dirty、历史结果或人工意见。
 * fingerprintingProtection 恒为 "not-tested"：未进行检测，而非检测后未发现。
 */
import type {
  DifferenceMetrics,
  FeedbackDifference,
  FeedbackReport,
  SessionStage,
  Side,
} from "../contracts/index.js";

/** 浏览器自报信息；不保证准确识别品牌或真实硬件。 */
export interface BrowserInfo {
  readonly userAgent: string;
  readonly language: string;
  readonly devicePixelRatio: number;
}

export interface MeasuredFeedbackInput {
  readonly caseId: string;
  readonly browser: BrowserInfo;
  readonly metrics: DifferenceMetrics;
  /** 规范化后的两侧尺寸，用于反馈的 nativeSize/compatSize。 */
  readonly nativeSize: { readonly width: number; readonly height: number };
  readonly compatSize: { readonly width: number; readonly height: number };
}

export interface FailedFeedbackInput {
  readonly caseId: string;
  readonly browser: BrowserInfo;
  /** 无法归属单侧时为 null。 */
  readonly side: Side | null;
  readonly stage: SessionStage;
  readonly reason: string;
}

/** 序列化成功量测的反馈；字段集合严格为冻结契约，不扩展。 */
export function serializeMeasuredFeedback(
  input: MeasuredFeedbackInput,
): FeedbackReport {
  const difference: FeedbackDifference = {
    protocolVersion: 1,
    status: "measured",
    nativeSize: input.nativeSize,
    compatSize: input.compatSize,
    changedPixels: input.metrics.changedPixels,
    totalPixels: input.metrics.totalPixels,
    changedRatio: input.metrics.changedRatio,
    maxChannelDelta: input.metrics.maxChannelDelta,
    differenceBounds: input.metrics.differenceBounds,
  };
  return {
    caseId: input.caseId,
    browser: {
      userAgent: input.browser.userAgent,
      language: input.browser.language,
      devicePixelRatio: input.browser.devicePixelRatio,
      fingerprintingProtection: "not-tested",
    },
    difference,
  };
}

/** 序列化失败反馈；不携带任何数值指标。 */
export function serializeFailedFeedback(
  input: FailedFeedbackInput,
): FeedbackReport {
  const difference: FeedbackDifference = {
    protocolVersion: 1,
    status: "failed",
    side: input.side,
    stage: input.stage,
    reason: input.reason,
  };
  return {
    caseId: input.caseId,
    browser: {
      userAgent: input.browser.userAgent,
      language: input.browser.language,
      devicePixelRatio: input.browser.devicePixelRatio,
      fingerprintingProtection: "not-tested",
    },
    difference,
  };
}

/**
 * 格式化差异占比为百分比文本。
 * 非零比例不得因舍入显示为 0：逐级提高精度，仍不足时显示 "<0.0001%"。
 */
export function formatChangedRatio(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1)
    throw new RangeError(`feedback: changedRatio 必须在 0–1，收到 ${ratio}`);
  if (ratio === 0) return "0%";
  const percent = ratio * 100;
  for (const digits of [2, 4, 6]) {
    const text = percent.toFixed(digits);
    if (Number.parseFloat(text) > 0) return `${text}%`;
  }
  return "<0.0001%";
}
