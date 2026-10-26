/**
 * 浏览器/Node 共享的严格像素差分纯核心（issue #68，契约见 #66/#64）。
 * 只依赖类型化数组，不引入 Node 内置模块；浏览器与 Node 使用同一实现。
 *
 * 输入为最终 scene 像素读回值：sRGB、非预乘 RGBA8、左上起逐行。
 * 规范化（alpha=0 时 RGB 归零）不修改调用方缓冲区。
 * 指标只描述像素读回差异，不是相似度、严重程度或通过/拒绝结论；
 * 读回差异可能包含浏览器指纹保护噪声，不得自动归因为渲染缺陷。
 */
import type {
  DifferenceBounds,
  DifferenceMetrics,
  PixelData,
} from "../contracts/index.js";

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

/** 量测错误：可归因的无效输入，调用方据此清空画面与指标并展示具体原因。 */
export class MeasurementError extends Error {
  readonly reason: InvalidMeasurementInput;
  constructor(reason: InvalidMeasurementInput, message: string) {
    super(message);
    this.name = "MeasurementError";
    this.reason = reason;
  }
}

/** 二值差异图：差异像素 [255,0,180,255]，相同像素 [0,0,0,0]；颜色不编码强度。 */
export const DIFFERENCE_PIXEL: readonly [number, number, number, number] = [
  255, 0, 180, 255,
];

/**
 * 归一化输入：返回 alpha=0 时 RGB 归零的副本；不修改原缓冲区。
 * 尺寸必须为正整数，长度必须等于 width*height*4；否则抛 MeasurementError。
 */
export function normalizePixels(input: PixelData): NormalizedPixels {
  const { width, height, pixels } = input;
  if (!Number.isInteger(width) || !Number.isInteger(height))
    throw new MeasurementError(
      "invalid-format",
      `measurement: 尺寸必须为整数，收到 width=${String(width)} height=${String(height)}`,
    );
  if (width <= 0 || height <= 0)
    throw new MeasurementError(
      "zero-size",
      `measurement: 尺寸必须为正，收到 ${width}x${height}`,
    );
  if (pixels.length !== width * height * 4)
    throw new MeasurementError(
      "incomplete-data",
      `measurement: 像素长度 ${pixels.length} 与 ${width}x${height} RGBA8 不符`,
    );
  const normalized = new Uint8Array(pixels);
  for (let i = 0; i < normalized.length; i += 4) {
    if (normalized[i + 3] === 0) {
      normalized[i] = 0;
      normalized[i + 1] = 0;
      normalized[i + 2] = 0;
    }
  }
  return { width, height, pixels: normalized };
}

export interface PixelDifference {
  readonly metrics: DifferenceMetrics;
  /** 二值定位图，尺寸与输入一致；仅用于定位差异，不构成验收结论。 */
  readonly image: Uint8Array;
}

/**
 * 对两份规范化输入做严格 RGBA 差分。
 * 输入不合法时抛 MeasurementError；不缩放、不补齐、不截取交集。
 */
export function diffPixels(
  native: NormalizedPixels,
  compat: NormalizedPixels,
): PixelDifference {
  if (native.width !== compat.width || native.height !== compat.height)
    throw new MeasurementError(
      "size-mismatch",
      `measurement: 两侧尺寸不一致（${native.width}x${native.height} 对 ${compat.width}x${compat.height}）`,
    );
  const { width, height } = native;
  const image = new Uint8Array(width * height * 4);
  let changedPixels = 0;
  let maxChannelDelta = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < native.pixels.length; i += 4) {
    let delta = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      const difference = Math.abs(
        (native.pixels[i + channel] ?? 0) - (compat.pixels[i + channel] ?? 0),
      );
      if (difference > delta) delta = difference;
    }
    if (delta === 0) continue;
    changedPixels += 1;
    if (delta > maxChannelDelta) maxChannelDelta = delta;
    const x = (i / 4) % width;
    const y = Math.floor(i / 4 / width);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    image.set(DIFFERENCE_PIXEL, i);
  }
  const totalPixels = width * height;
  const bounds: DifferenceBounds | null = changedPixels
    ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : null;
  return {
    metrics: {
      totalPixels,
      changedPixels,
      changedRatio: changedPixels / totalPixels,
      maxChannelDelta,
      differenceBounds: bounds,
    },
    image,
  };
}

/**
 * 量测入口：规范化两份原始输入并差分；无效输入不抛异常而返回 invalid。
 * 不修改调用方缓冲区；同一输入重复调用结果一致（显示模式无关）。
 */
export function measurePixelDifference(
  native: PixelData,
  compat: PixelData,
): MeasurementOutcome {
  try {
    const normalizedNative = normalizePixels(native);
    const normalizedCompat = normalizePixels(compat);
    const { metrics } = diffPixels(normalizedNative, normalizedCompat);
    return { status: "measured", metrics };
  } catch (error) {
    if (error instanceof MeasurementError)
      return { status: "invalid", reason: error.reason };
    throw error;
  }
}
