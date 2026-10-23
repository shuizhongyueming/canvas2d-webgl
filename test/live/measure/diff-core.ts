/**
 * 浏览器/Node 共享的严格像素差分纯核心桩（issue #66 冻结接口）。
 * 输入为规范化后的 RGBA8 像素；本票不提供实现，由量测票（#68）落地。
 */
import type { DifferenceMetrics, PixelData } from "../contracts/index.js";

/** 规范化结果；alpha=0 时 RGB 已归零，输入缓冲区不被修改。 */
export type NormalizedPixels = PixelData;

/** 输入无效时的失败原因；不产生有效指标。 */
export type InvalidMeasurementInput =
  | "size-mismatch"
  | "zero-size"
  | "invalid-format"
  | "incomplete-data"
  | "sample-failed";

export type MeasurementOutcome =
  | { readonly status: "measured"; readonly metrics: DifferenceMetrics }
  | { readonly status: "invalid"; readonly reason: InvalidMeasurementInput };

export function measurePixelDifference(
  _native: PixelData,
  _compat: PixelData,
): MeasurementOutcome {
  throw new Error(
    "not-implemented: measurePixelDifference 由工具量测票（#68）实现；本票仅冻结接口",
  );
}
