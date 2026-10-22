import { DEFAULT_STYLE_IDS } from "./solid.js";

/**
 * Paint ids identify a live paint across the whole realm, not per canvas.
 *
 * The public brand lets a gradient or pattern created on one canvas be
 * assigned to another canvas's style, and the raster cache keys assets by
 * kind/id/version. A per-canvas counter would restart at the same value on
 * every canvas, so the second canvas would serve the first canvas's cached
 * asset instead of evaluating its own paint. Allocation is therefore
 * realm-wide and monotonic, which keeps every id above the reserved
 * default-style range while staying unique across canvases.
 */
let nextPaintId = DEFAULT_STYLE_IDS.stroke + 1;

export function allocPaintId(): number {
  return nextPaintId++;
}
