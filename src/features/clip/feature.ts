import type {
  Bounds,
  ClipSnapshot,
  FeatureDefinition,
  FeatureFactory,
} from "../../internal/contracts.js";
import { createCompatError, ERROR_CODES } from "../../contracts/errors.js";
import { PathRecorder } from "../../path/recorder.js";

/**
 * Public clip surface: clip() and clip("evenodd").
 *
 * The call records an immutable ClipSnapshot whose parent is the previous
 * effective clip; the current path is never consumed or reset. Coverage is
 * not computed here: each snapshot carries a mask provider that resolves the
 * entire chain's native soft coverage at draw time. The GPU applies this
 * coverage during compositing. The Path2D overloads are outside the
 * approved matrix and report unsupported-api.
 */

/** Native enum conversion for the single rule argument. */
function ruleFrom(args: readonly unknown[]): "nonzero" | "evenodd" {
  if (args.length === 0) return "nonzero";
  if (args.length >= 2) {
    // WebIDL picks the (Path2D, CanvasFillRule) overload for two or more
    // arguments; a non-Path2D first argument fails conversion. The Path2D
    // form itself is an unapproved overload.
    if (isPath2D(args[0])) unsupportedPath2D();
    throw new TypeError(
      "Failed to execute 'clip' on 'CanvasRenderingContext2D': parameter 1 is not of type 'Path2D'.",
    );
  }
  const value = args[0];
  // An optional argument supplied as undefined is treated as absent.
  if (value === undefined) return "nonzero";
  if (isPath2D(value)) unsupportedPath2D();
  // Symbol rejects during DOMString conversion; native prefixes the WebIDL
  // conversion failure with the operation context.
  let rule: string;
  try {
    rule = `${value}`;
  } catch (error) {
    if (error instanceof TypeError)
      throw new TypeError(
        `Failed to execute 'clip' on 'CanvasRenderingContext2D': ${error.message}`,
      );
    throw error;
  }
  if (rule === "nonzero" || rule === "evenodd") return rule;
  throw new TypeError(
    `Failed to execute 'clip' on 'CanvasRenderingContext2D': The provided value '${rule}' is not a valid enum value of type CanvasFillRule.`,
  );
}

/**
 * Brand check that also works when Path2D comes from another realm. The
 * platform may not expose Path2D at all; then no value can be one.
 */
function isPath2D(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const ctor = (globalThis as { Path2D?: unknown }).Path2D;
  if (typeof ctor === "function" && value instanceof (ctor as new () => object))
    return true;
  return Object.prototype.toString.call(value) === "[object Path2D]";
}

function unsupportedPath2D(): never {
  throw createCompatError(
    ERROR_CODES.UNSUPPORTED_API,
    "clip: Path2D overloads are not in the approved matrix",
  );
}

export const clipFeature: FeatureFactory = (environment): FeatureDefinition => {
  const state = environment?.state;
  const path = environment?.path;
  const gpu = environment?.gpu;
  const raster = environment?.raster;
  const lifecycle = environment?.lifecycle;
  if (!state || !path || !gpu || !raster || !lifecycle)
    throw createCompatError(
      ERROR_CODES.CONTRACT,
      "clip feature requires environment.state, path, gpu, raster and lifecycle",
    );
  if (!(path instanceof PathRecorder))
    throw createCompatError(
      ERROR_CODES.CONTRACT,
      "clip feature requires environment.path to be a PathRecorder",
    );
  // Ids only need to be unique within this canvas instance.
  let nextId = 1;

  // Clips own no GPU or native bitmap: a snapshot is a reference, its mask
  // canvas belongs to the raster cache, and the session already drops current
  // and saved clips (StateStore.reset / discardClips) before invalidating
  // those masks (raster.clearCache). Registering keeps clip inside the one
  // lifecycle contract, makes the ordering explicit, and reserves the place
  // where future clip-owned resources must be released.
  lifecycle.register({
    reset() {
      // state.reset() ran first and replaced the whole drawing state.
    },
    lost() {
      // Drawing is paused; nothing is queued and no clip survives to redraw.
    },
    restored() {
      // state.discardClips() ran first; stale mask canvases were cleared.
    },
    disposed() {
      // No clip-owned resources to release.
    },
  });

  /** While lost, clip is silently ineffective and never queued (LIFE-02). */
  function assertUsable(): boolean {
    if (gpu.status === "disposed")
      throw createCompatError(ERROR_CODES.DISPOSED, "canvas is disposed");
    return gpu.status === "active";
  }

  return {
    id: "clip",
    members: {
      clip: {
        value(...args: readonly unknown[]) {
          const rule = ruleFrom(args);
          if (!assertUsable()) return;
          // Capture the current path as an immutable snapshot; later
          // beginPath/geometry calls must not change this clip.
          const snapshot = path.snapshot();
          const parent = state.get("clip") as ClipSnapshot | null;
          const level: ClipSnapshot = Object.freeze({
            id: nextId++,
            parent,
            path: snapshot,
            rule,
            // Resolve through the shared native rasterizer with the scene
            // bounds the device supplies. The raster cache owns the canvas;
            // the device releases its lease after the operation.
            mask: (bounds: Bounds) =>
              raster.clip(snapshot, rule, bounds, parent),
          });
          state.set("clip", level);
        },
      },
    },
  };
};
