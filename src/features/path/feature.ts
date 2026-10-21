import type {
  FeatureDefinition,
  FeatureFactory,
  Matrix,
} from "../../internal/contracts.js";
import { createCompatError, ERROR_CODES } from "../../contracts/errors.js";
import { PathRecorder } from "../../path/recorder.js";

/**
 * Public path surface: the approved construction methods and the zero-argument
 * fill/stroke. Construction records each command with the transform in effect
 * at call time; fill/stroke snapshot the drawing state, rasterize the current
 * path through the approved native asset service and composite the result as
 * one draw operation. The Path2D and fill-rule overloads are outside the
 * approved matrix and report unsupported-api instead of being exposed just
 * because the native layer could perform them.
 */

/** WebIDL double conversion: BigInt and Symbol reject with a native TypeError. */
function coordinate(value: unknown): number {
  return +(value as number);
}

/** WebIDL argument conversion with the native arity error. */
function coordinates(
  name: string,
  args: readonly unknown[],
  required: number,
): number[] {
  if (args.length < required)
    throw new TypeError(
      `Failed to execute '${name}' on 'CanvasRenderingContext2D': ${required} arguments required, but only ${args.length} present.`,
    );
  // The recorder drops non-finite geometry; converting first keeps the
  // BigInt/Symbol TypeError ahead of that silent skip, like native.
  return args.slice(0, required).map((value) => coordinate(value));
}

function unsupportedOverload(name: string): never {
  throw createCompatError(
    ERROR_CODES.UNSUPPORTED_API,
    `${name}: overloads beyond the zero-argument form (Path2D, fill rule)`,
  );
}

export const pathFeature: FeatureFactory = (environment): FeatureDefinition => {
  const state = environment?.state;
  const path = environment?.path;
  const gpu = environment?.gpu;
  const raster = environment?.raster;
  if (!state || !gpu || !raster)
    throw createCompatError(
      ERROR_CODES.CONTRACT,
      "path feature requires environment.state, gpu and raster",
    );
  // The public current path is the shared recorder: it carries the native
  // argument semantics (non-finite drop, negative-radius IndexSizeError) and
  // is the same instance resize/loss orchestration resets.
  if (!(path instanceof PathRecorder))
    throw createCompatError(
      ERROR_CODES.CONTRACT,
      "path feature requires environment.path to be a PathRecorder",
    );

  /** While lost, drawing is silently ineffective and never queued (LIFE-02). */
  function assertUsable(): boolean {
    if (gpu.status === "disposed")
      throw createCompatError(ERROR_CODES.DISPOSED, "canvas is disposed");
    return gpu.status === "active";
  }

  function currentTransform(): Matrix {
    return state.get("transform") as Matrix;
  }

  /** Rasterize the current path and composite the asset as one operation. */
  function drawPath(mode: "fill" | "stroke"): void {
    const current = path.snapshot();
    if (!current.commands.some((command) => command.op !== "closePath")) return;
    const snapshot = state.snapshot();
    const source = raster.path(current, snapshot, mode);
    try {
      gpu.draw({
        generation: gpu.generation,
        kind: "draw",
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

  return {
    id: "path",
    members: {
      beginPath: {
        value() {
          if (!assertUsable()) return;
          path.begin();
        },
      },
      moveTo: {
        value(...args: readonly unknown[]) {
          const values = coordinates("moveTo", args, 2);
          if (!assertUsable()) return;
          path.moveTo(values[0]!, values[1]!, currentTransform());
        },
      },
      lineTo: {
        value(...args: readonly unknown[]) {
          const values = coordinates("lineTo", args, 2);
          if (!assertUsable()) return;
          path.lineTo(values[0]!, values[1]!, currentTransform());
        },
      },
      closePath: {
        value() {
          if (!assertUsable()) return;
          path.closePath(currentTransform());
        },
      },
      rect: {
        value(...args: readonly unknown[]) {
          const values = coordinates("rect", args, 4);
          if (!assertUsable()) return;
          path.rect(
            values[0]!,
            values[1]!,
            values[2]!,
            values[3]!,
            currentTransform(),
          );
        },
      },
      quadraticCurveTo: {
        value(...args: readonly unknown[]) {
          const values = coordinates("quadraticCurveTo", args, 4);
          if (!assertUsable()) return;
          path.quadraticCurveTo(
            values[0]!,
            values[1]!,
            values[2]!,
            values[3]!,
            currentTransform(),
          );
        },
      },
      arcTo: {
        value(...args: readonly unknown[]) {
          const values = coordinates("arcTo", args, 5);
          if (!assertUsable()) return;
          path.arcTo(
            values[0]!,
            values[1]!,
            values[2]!,
            values[3]!,
            values[4]!,
            currentTransform(),
          );
        },
      },
      arc: {
        value(...args: readonly unknown[]) {
          const values = coordinates("arc", args, 5);
          if (!assertUsable()) return;
          // WebIDL boolean: plain truthiness, never a conversion error.
          path.arc(
            values[0]!,
            values[1]!,
            values[2]!,
            values[3]!,
            values[4]!,
            Boolean(args[5]),
            currentTransform(),
          );
        },
      },
      ellipse: {
        value(...args: readonly unknown[]) {
          const values = coordinates("ellipse", args, 7);
          if (!assertUsable()) return;
          path.ellipse(
            values[0]!,
            values[1]!,
            values[2]!,
            values[3]!,
            values[4]!,
            values[5]!,
            values[6]!,
            Boolean(args[7]),
            currentTransform(),
          );
        },
      },
      fill: {
        value(...args: readonly unknown[]) {
          if (args.length > 0) unsupportedOverload("fill");
          if (!assertUsable()) return;
          drawPath("fill");
        },
      },
      stroke: {
        value(...args: readonly unknown[]) {
          if (args.length > 0) unsupportedOverload("stroke");
          if (!assertUsable()) return;
          drawPath("stroke");
        },
      },
    },
  };
};
