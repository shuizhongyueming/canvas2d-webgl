import type {
  Bounds,
  Color,
  DrawState,
  FeatureDefinition,
  FeatureFactory,
  Matrix,
  Paint,
} from "../../internal/contracts.js";
import { createCompatError, ERROR_CODES } from "../../contracts/errors.js";

/**
 * Rectangle drawing: fillRect/clearRect/strokeRect.
 *
 * Integer-aligned solid fills and clears use GPU quads. Other fills/clears
 * use native fillRect coverage; strokes use native strokeRect coverage. These
 * members share the native rasterizer's paint evaluation and none of them
 * touch the current path. Clear operations ignore paint, alpha and filter by
 * contract while still honoring the draw-time transform and the effective clip.
 */

/** WebIDL double conversion: BigInt and Symbol reject with a native TypeError. */
function coordinate(value: unknown): number {
  return +(value as number);
}

/**
 * The shared four-argument rect signature. Missing arguments are native
 * TypeErrors; non-finite geometry is silently ignored, exactly like native.
 */
function rectArguments(
  name: string,
  args: readonly unknown[],
): readonly [number, number, number, number] | null {
  if (args.length < 4)
    throw new TypeError(
      `Failed to execute '${name}' on 'CanvasRenderingContext2D': 4 arguments required, but only ${args.length} present.`,
    );
  const values: [number, number, number, number] = [
    coordinate(args[0]),
    coordinate(args[1]),
    coordinate(args[2]),
    coordinate(args[3]),
  ];
  if (!values.every((value) => Number.isFinite(value))) return null;
  return values;
}

/** Device-space axis-aligned hull of a user-space rect under the draw transform. */
function deviceBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  transform: Matrix,
): Bounds {
  const [a, b, c, d, e, f] = transform;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cornerX of [x, x + width])
    for (const cornerY of [y, y + height]) {
      const deviceX = a * cornerX + c * cornerY + e;
      const deviceY = b * cornerX + d * cornerY + f;
      if (deviceX < minX) minX = deviceX;
      if (deviceX > maxX) maxX = deviceX;
      if (deviceY < minY) minY = deviceY;
      if (deviceY > maxY) maxY = deviceY;
    }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** A quad has exact native coverage only for axis-aligned integer edges. */
function integerEdges(
  x: number,
  y: number,
  width: number,
  height: number,
  transform: Matrix,
): boolean {
  const [a, b, c, d] = transform;
  if (!((b === 0 && c === 0) || (a === 0 && d === 0))) return false;
  const bounds = deviceBounds(x, y, width, height, transform);
  return [
    bounds.x,
    bounds.y,
    bounds.x + bounds.width,
    bounds.y + bounds.height,
  ].every(Number.isInteger);
}

/** Placeholder for the unused paint slot of a clear operation's rect source. */
const CLEAR_PAINT: Paint = Object.freeze({
  kind: "solid",
  color: Object.freeze([0, 0, 0, 1]) as Color,
}) as Paint;

export const rectFeature: FeatureFactory = (environment): FeatureDefinition => {
  const state = environment?.state;
  const gpu = environment?.gpu;
  const raster = environment?.raster;
  if (!state || !gpu || !raster)
    throw createCompatError(
      ERROR_CODES.CONTRACT,
      "rect feature requires environment.state, gpu and raster",
    );

  /** While lost, drawing is silently ineffective and never queued (LIFE-02). */
  function assertUsable(): boolean {
    if (gpu.status === "disposed")
      throw createCompatError(ERROR_CODES.DISPOSED, "canvas is disposed");
    return gpu.status === "active";
  }

  /** Rasterize the rect with the native service and composite the asset once. */
  function drawRasterRect(
    x: number,
    y: number,
    width: number,
    height: number,
    snapshot: DrawState,
    mode: "fill" | "stroke" | "clear",
  ): void {
    const source = raster.rect(x, y, width, height, snapshot, mode);
    try {
      // Empty coverage still becomes an operation: source-in erases the
      // effective clip, the other modes are no-ops in the device.
      gpu.draw({
        generation: gpu.generation,
        kind: mode === "clear" ? "clear" : "draw",
        state: snapshot,
        source:
          source.bounds.width <= 0 || source.bounds.height <= 0
            ? { kind: "empty" }
            : source,
        sourceBounds: source.bounds,
        clip: snapshot.clip,
      });
    } finally {
      // The device consumed the native bitmap synchronously during draw.
      source.release();
    }
  }

  function fillRect(...args: readonly unknown[]): void {
    const rect = rectArguments("fillRect", args);
    if (!rect || !assertUsable()) return;
    const [x, y, width, height] = rect;
    if (width === 0 && height === 0) return;
    const snapshot = state.snapshot();
    if (width === 0 || height === 0) {
      if (snapshot.composite === "source-in")
        gpu.draw({
          generation: gpu.generation,
          kind: "draw",
          state: snapshot,
          source: { kind: "empty" },
          sourceBounds: { x, y, width: 0, height: 0 },
          clip: snapshot.clip,
        });
      return;
    }
    if (
      snapshot.fill.kind !== "solid" ||
      snapshot.composite === "source-in" ||
      !integerEdges(x, y, width, height, snapshot.transform)
    ) {
      drawRasterRect(x, y, width, height, snapshot, "fill");
      return;
    }
    gpu.draw({
      generation: gpu.generation,
      kind: "draw",
      state: snapshot,
      source: {
        kind: "rect",
        bounds: { x, y, width, height },
        transform: snapshot.transform,
        paint: snapshot.fill,
      },
      sourceBounds: deviceBounds(x, y, width, height, snapshot.transform),
      clip: snapshot.clip,
    });
  }

  function clearRect(...args: readonly unknown[]): void {
    const rect = rectArguments("clearRect", args);
    if (!rect || !assertUsable()) return;
    const [x, y, width, height] = rect;
    if (width === 0 || height === 0) return;
    const snapshot = state.snapshot();
    if (!integerEdges(x, y, width, height, snapshot.transform)) {
      drawRasterRect(x, y, width, height, snapshot, "clear");
      return;
    }
    gpu.draw({
      generation: gpu.generation,
      kind: "clear",
      state: snapshot,
      source: {
        kind: "rect",
        bounds: { x, y, width, height },
        transform: snapshot.transform,
        paint: CLEAR_PAINT,
      },
      sourceBounds: deviceBounds(x, y, width, height, snapshot.transform),
      clip: snapshot.clip,
    });
  }

  function strokeRect(...args: readonly unknown[]): void {
    const rect = rectArguments("strokeRect", args);
    if (!rect || !assertUsable()) return;
    const [x, y, width, height] = rect;
    // Native: both zero draws nothing; exactly one zero strokes a line, which
    // the recorded rect reproduces through the rasterizer.
    if (width === 0 && height === 0) return;
    drawRasterRect(x, y, width, height, state.snapshot(), "stroke");
  }

  return {
    id: "rect",
    members: {
      fillRect: { value: fillRect },
      clearRect: { value: clearRect },
      strokeRect: { value: strokeRect },
    },
  };
};
