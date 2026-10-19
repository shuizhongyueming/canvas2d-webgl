import type { Matrix, Paint } from "../internal/contracts.js";
import type { Native2DContext } from "./native.js";
import { createCompatError, ERROR_CODES } from "../contracts/errors.js";
import { applyPoint, invert, offsetMatrix } from "./matrix.js";

function channel(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

export function cssColor(color: readonly [number, number, number, number]): string {
  const alpha = Math.min(1, Math.max(0, color[3]));
  return `rgba(${channel(color[0])},${channel(color[1])},${channel(color[2])},${alpha})`;
}

type StyleContext = Pick<
  Native2DContext,
  "createLinearGradient" | "createPattern" | "fillStyle" | "strokeStyle"
>;

/**
 * Bake a Paint into native style state. Solid colors are written directly.
 * Gradients are defined by creation-time transform and user-space endpoints, so
 * their device-space endpoints are re-expressed in the space the native paint
 * will be interpreted in: asset space for fill, the stroke-time transform for
 * stroke. Patterns paint in the current draw space and are handed over as-is.
 */
export function applyPaint(
  ctx: StyleContext,
  paint: Paint,
  mode: "fill" | "stroke",
  offsetX: number,
  offsetY: number,
  strokeTransform: Matrix,
): void {
  let style: string | CanvasGradient | CanvasPattern;
  if (paint.kind === "solid") {
    style = cssColor(paint.color);
  } else if (paint.kind === "linear-gradient") {
    let from = applyPoint(paint.transform, paint.from[0], paint.from[1]);
    let to = applyPoint(paint.transform, paint.to[0], paint.to[1]);
    from = [from[0] - offsetX, from[1] - offsetY];
    to = [to[0] - offsetX, to[1] - offsetY];
    if (mode === "stroke") {
      // Native stroke interprets the gradient in the stroke-time space; pre-multiply
      // by the inverse of the asset-space stroke transform so the device-space ramp
      // stays the creation-time one.
      const inv = invert(offsetMatrix(strokeTransform, offsetX, offsetY));
      if (inv) {
        from = applyPoint(inv, from[0], from[1]);
        to = applyPoint(inv, to[0], to[1]);
      }
    }
    const gradient = ctx.createLinearGradient(from[0], from[1], to[0], to[1]);
    for (const stop of paint.stops)
      gradient.addColorStop(stop.offset, cssColor(stop.color));
    style = gradient;
  } else {
    const pattern = ctx.createPattern(paint.image, "repeat");
    if (!pattern)
      throw createCompatError(
        ERROR_CODES.CONTRACT,
        "repeat-pattern paint produced no native pattern",
      );
    style = pattern;
  }
  if (mode === "fill") ctx.fillStyle = style;
  else ctx.strokeStyle = style;
}
