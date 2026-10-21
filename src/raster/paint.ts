import type { Paint, PatternBitmap } from "../internal/contracts.js";
import type { Native2DContext } from "./native.js";

function channel(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

export function cssColor(
  color: readonly [number, number, number, number],
): string {
  const alpha = Math.min(1, Math.max(0, color[3]));
  return `rgba(${channel(color[0])},${channel(color[1])},${channel(color[2])},${alpha})`;
}

type StyleContext = Pick<
  Native2DContext,
  "createLinearGradient" | "createPattern" | "fillStyle" | "strokeStyle"
>;

/**
 * Turns a captured pattern bitmap into a native pattern at the platform
 * boundary. The caller (rasterizer) owns the scratch canvas behind it;
 * native createPattern copies the scratch bitmap synchronously, so the
 * returned pattern stays valid after the scratch is reused.
 */
export type PatternSource = (bitmap: PatternBitmap) => CanvasPattern;

/**
 * Bake a Paint into native style state. Solid colors are written directly.
 *
 * Gradients and patterns are interpreted by the native rasterizer in the
 * coordinate space of the transform in effect WHEN RENDERING (HTML Standard,
 * createLinearGradient; issue #33), never in a creation-time space. Callers
 * have already installed the draw-time transform on `ctx` before calling, so
 * the recorded user-space gradient endpoints pass through verbatim and native
 * derives the device-space ramp itself: device = drawTransform ∘ endpoint.
 *
 * Asset-space composition is equally native: the text path installs
 * offsetMatrix(drawTransform, assetOrigin), so native computes
 * drawTransform ∘ endpoint − assetOrigin — the draw-time ramp shifted into
 * asset space with no inverse-matrix premultiplication anywhere.
 */
export function applyPaint(
  ctx: StyleContext,
  paint: Paint,
  mode: "fill" | "stroke",
  patternSource: PatternSource,
): void {
  let style: string | CanvasGradient | CanvasPattern;
  if (paint.kind === "solid") {
    style = cssColor(paint.color);
  } else if (paint.kind === "linear-gradient") {
    const gradient = ctx.createLinearGradient(
      paint.from[0],
      paint.from[1],
      paint.to[0],
      paint.to[1],
    );
    for (const stop of paint.stops)
      gradient.addColorStop(stop.offset, cssColor(stop.color));
    style = gradient;
  } else {
    style = patternSource(paint.image);
  }
  if (mode === "fill") ctx.fillStyle = style;
  else ctx.strokeStyle = style;
}
