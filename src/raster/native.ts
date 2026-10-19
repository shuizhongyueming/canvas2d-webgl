import type { NativeCanvas } from "../api.js";
import { createCompatError, ERROR_CODES } from "../contracts/errors.js";

export type Native2DContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export function context2d(canvas: NativeCanvas): Native2DContext {
  const context = canvas.getContext("2d");
  if (!context)
    throw createCompatError(
      ERROR_CODES.CAPABILITY,
      "native offscreen 2D context is unavailable",
    );
  return context;
}

/** Release the bitmap of an internally owned native canvas. Idempotent. */
export function destroyCanvas(canvas: NativeCanvas): void {
  canvas.width = 0;
  canvas.height = 0;
}
