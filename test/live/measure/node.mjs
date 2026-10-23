/**
 * Node 侧量测适配层（issue #68）。
 * 复用浏览器/Node 共享的纯 TypeScript 核心（dist/live/measure/diff-core.js），
 * 承担 TypedArray/Buffer 转换；PNG 编码、文件读写与 hash 仍留在
 * test/harness/evidence.mjs 与各 scripts 层，不进入浏览器模块。
 *
 * 本层输出结构与既有 evidence.diffPixels / review-index.measurePair 完全一致，
 * 不改写历史证据或评审状态；读回差异不自动归因为渲染缺陷。
 */
import {
  MeasurementError,
  diffPixels as coreDiffPixels,
  normalizePixels as coreNormalizePixels,
} from "../../../dist/live/measure/diff-core.js";

export { MeasurementError };

/** Buffer/TypedArray → 核心 PixelData 视图；仅借出缓冲区，不复制。 */
function toPixelData(image) {
  const data = image.data;
  if (!(data instanceof Uint8Array) && !(data instanceof Uint8ClampedArray))
    throw new MeasurementError(
      "invalid-format",
      `measurement: 像素缓冲必须是 Uint8Array/Uint8ClampedArray，收到 ${data?.constructor?.name ?? typeof data}`,
    );
  return {
    width: image.width,
    height: image.height,
    pixels: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  };
}

/**
 * 严格差分，返回与旧 evidence.diffPixels 相同的形状：
 * { width, height, data, changedPixels, bounds }，另附 maxChannelDelta 与
 * changedRatio/totalPixels 供报告复用。尺寸不一致抛 MeasurementError。
 */
export function diffPixels(a, b) {
  const result = coreDiffPixels(toPixelData(a), toPixelData(b));
  const { metrics } = result;
  return {
    width: a.width,
    height: a.height,
    data: Buffer.from(
      result.image.buffer,
      result.image.byteOffset,
      result.image.byteLength,
    ),
    changedPixels: metrics.changedPixels,
    totalPixels: metrics.totalPixels,
    changedRatio: metrics.changedRatio,
    maxChannelDelta: metrics.maxChannelDelta,
    bounds: metrics.differenceBounds,
  };
}

/**
 * 规范化副本：alpha=0 时 RGB 归零；不修改原缓冲区。
 * 供采集/评审在写证据前统一透明像素口径。
 */
export function normalizePixels(image) {
  const normalized = coreNormalizePixels(toPixelData(image));
  return {
    width: normalized.width,
    height: normalized.height,
    data: Buffer.from(
      normalized.pixels.buffer,
      normalized.pixels.byteOffset,
      normalized.pixels.byteLength,
    ),
  };
}
