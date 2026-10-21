import type { CompatTextMetrics } from "../../api.js";
import type {
  DrawState,
  FeatureDefinition,
  FeatureFactory,
} from "../../internal/contracts.js";
import { createCompatError, ERROR_CODES } from "../../contracts/errors.js";

function unsupported(detail: string): never {
  throw createCompatError(ERROR_CODES.UNSUPPORTED_API, detail);
}

/** WebIDL DOMString conversion: Symbol rejects with a native TypeError. */
function text(value: unknown): string {
  return `${value as string}`;
}

/** WebIDL double conversion: BigInt and Symbol reject with a native TypeError. */
function coordinate(value: unknown): number {
  return +(value as number);
}

/**
 * The shared three-argument text signature. Missing arguments are native
 * TypeErrors; a present maxWidth (4th) argument is the unsupported overload;
 * non-finite coordinates are silently ignored, exactly like native.
 */
function textArguments(
  name: string,
  args: readonly unknown[],
): readonly [string, number, number] | null {
  if (args.length < 3)
    throw new TypeError(
      `Failed to execute '${name}' on 'CanvasRenderingContext2D': 3 arguments required, but only ${args.length} present.`,
    );
  // An explicitly passed undefined is a missing optional argument in WebIDL.
  if (args.length > 3 && args[3] !== undefined) unsupported(`${name} maxWidth`);
  const value = text(args[0]);
  const x = coordinate(args[1]);
  const y = coordinate(args[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [value, x, y];
}

const UNSUPPORTED_METRICS = [
  "actualBoundingBoxLeft",
  "actualBoundingBoxRight",
  "actualBoundingBoxAscent",
  "actualBoundingBoxDescent",
  "fontBoundingBoxAscent",
  "fontBoundingBoxDescent",
  "emHeightAscent",
  "emHeightDescent",
  "hangingBaseline",
  "alphabeticBaseline",
  "ideographicBaseline",
] as const;

/**
 * Fresh metrics object per call, like native. Only `width` is readable; the
 * remaining spec members throw on access (support matrix owner: text). All
 * properties are non-enumerable own getters, matching native enumerability.
 */
function createMetrics(width: number): CompatTextMetrics {
  const descriptors: PropertyDescriptorMap = {
    width: {
      get: () => width,
      enumerable: false,
      configurable: false,
    },
  };
  for (const name of UNSUPPORTED_METRICS)
    descriptors[name] = {
      get: () => {
        throw createCompatError(ERROR_CODES.UNSUPPORTED_API, `metrics.${name}`);
      },
      enumerable: false,
      configurable: false,
    };
  return Object.create(null, descriptors) as CompatTextMetrics;
}

export const textFeature: FeatureFactory = (environment): FeatureDefinition => {
  const state = environment?.state;
  const gpu = environment?.gpu;
  const raster = environment?.raster;
  if (!state || !gpu || !raster)
    throw createCompatError(
      ERROR_CODES.CONTRACT,
      "text feature requires environment.state, gpu and raster",
    );

  /** While lost, drawing is silently ineffective and never queued (LIFE-02). */
  function assertUsable(): boolean {
    if (gpu.status === "disposed")
      throw createCompatError(ERROR_CODES.DISPOSED, "canvas is disposed");
    return gpu.status === "active";
  }

  /** Rasterize the string with the native service and composite the asset once. */
  function drawText(
    text: string,
    x: number,
    y: number,
    snapshot: DrawState,
    mode: "fill" | "stroke",
  ): void {
    const source = raster.text(text, x, y, snapshot, mode);
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

  function fillText(...args: readonly unknown[]): void {
    const parsed = textArguments("fillText", args);
    if (!parsed || !assertUsable()) return;
    drawText(parsed[0], parsed[1], parsed[2], state.snapshot(), "fill");
  }

  function strokeText(...args: readonly unknown[]): void {
    const parsed = textArguments("strokeText", args);
    if (!parsed || !assertUsable()) return;
    drawText(parsed[0], parsed[1], parsed[2], state.snapshot(), "stroke");
  }

  function measureText(...args: readonly unknown[]): CompatTextMetrics {
    if (args.length < 1)
      throw new TypeError(
        `Failed to execute 'measureText' on 'CanvasRenderingContext2D': 1 argument required, but only ${args.length} present.`,
      );
    const value = text(args[0]);
    // Measurement is not a draw: it keeps working while the context is lost.
    if (gpu.status === "disposed")
      throw createCompatError(ERROR_CODES.DISPOSED, "canvas is disposed");
    return createMetrics(raster.measureWidth(value, state.snapshot()));
  }

  return {
    id: "text",
    members: {
      fillText: { value: fillText },
      strokeText: { value: strokeText },
      measureText: { value: measureText },
      font: {
        get() {
          return state.get("font");
        },
        set(value: unknown) {
          const candidate = text(value);
          // Native parsing decides: invalid strings are silently ignored, valid
          // ones are stored in their native normalized serialization so the
          // getter round-trips exactly like the native one.
          const normalized = raster.normalizeFont(candidate);
          if (normalized !== null) state.set("font", normalized);
        },
      },
      textAlign: {
        get() {
          return state.get("textAlign");
        },
        set(value: unknown) {
          const align = `${value}`;
          if (align === "left" || align === "center" || align === "right")
            state.set("textAlign", align);
          else if (align === "start" || align === "end")
            unsupported(`textAlign value: ${align}`);
          // Other illegal values are ignored, exactly like native.
        },
      },
      textBaseline: {
        get() {
          return state.get("textBaseline");
        },
        set(value: unknown) {
          const baseline = `${value}`;
          if (
            baseline === "top" ||
            baseline === "middle" ||
            baseline === "bottom"
          )
            state.set("textBaseline", baseline);
          else if (
            baseline === "alphabetic" ||
            baseline === "hanging" ||
            baseline === "ideographic"
          )
            unsupported(`textBaseline value: ${baseline}`);
          // Other illegal values are ignored, exactly like native.
        },
      },
    },
  };
};
