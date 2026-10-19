/**
 * Paint feature: colors, linear gradients and repeat-only patterns.
 *
 * Consumer guide:
 * - State ticket: install defaultStylePaint(DEFAULT_STYLE_IDS.fill/.stroke)
 *   for keys "fill"/"stroke" at initialization and reset; keep PaintRef
 *   references across save/restore; StateStore.snapshot() must call
 *   PaintRef.snapshot() so draws capture the current version/stops.
 *   paintFeature() also reads the "transform" key.
 * - GPU ticket: Paint snapshots plus REPEAT_PATTERN_GLSL cover both NPOT and
 *   POT tiling; texture wrap must stay CLAMP_TO_EDGE (see shader.ts).
 * - Raster ticket: the same Paint snapshots describe native-assisted draws;
 *   evaluate.ts is the executable reference for gradient interpolation.
 */
export { classifyColorValue, parseSupportedColor } from "./color.js";
export type { ColorValueClass, ParsedPaintColor } from "./color.js";
export { canonicalColorString, formatAlpha } from "./color.js";
export { LinearGradientPaint, isCompatGradient } from "./gradient.js";
export {
  RepeatPatternPaint,
  createRepeatPattern,
  isCompatPattern,
} from "./pattern.js";
export { SolidPaint, defaultStylePaint, DEFAULT_STYLE_IDS } from "./solid.js";
export {
  interpolateStops,
  linearGradientColorAt,
} from "./evaluate.js";
export {
  REPEAT_PATTERN_GLSL,
  REPEAT_PATTERN_WRAP_S,
  REPEAT_PATTERN_WRAP_T,
  repeatUv,
} from "./shader.js";
export { PAINT_STATE_KEYS, paintFeature } from "./feature.js";
export type { StylePaintRef } from "./feature.js";
