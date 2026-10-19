import { createCompatError, ERROR_CODES } from "../contracts/errors.js";
import type {
  FeatureDefinition,
  FeatureFactory,
  StateStore,
} from "../internal/contracts.js";
import { rotateBy, scaleBy, translateBy } from "./matrix.js";
import type { Matrix } from "../internal/contracts.js";

function unsupported(detail: string): never {
  throw createCompatError(ERROR_CODES.UNSUPPORTED_API, detail);
}

/** Largest finite float32; Chromium clamps overflowing finite arguments instead of producing infinities. */
const FLOAT32_MAX = 3.4028234663852886e38;

/** Chromium quantizes translate/scale/setTransform arguments to float32; rotate keeps its double angle. */
function toFloat32(value: number): number {
  return Math.fround(Math.min(Math.max(value, -FLOAT32_MAX), FLOAT32_MAX));
}

/** WebIDL argument conversion: missing arguments and BigInt/Symbol are TypeErrors, non-finite doubles are ignored. */
function coordinates(
  name: string,
  args: readonly unknown[],
  required: number,
  quantize: boolean,
): number[] | null {
  if (args.length < required)
    throw new TypeError(
      `Failed to execute '${name}' on 'CanvasRenderingContext2D': ${required} arguments required, but only ${args.length} present.`,
    );
  const values = args.slice(0, required).map((value) => +(value as number));
  if (!values.every((value) => Number.isFinite(value))) return null;
  return quantize ? values.map(toFloat32) : values;
}

function transform(state: StateStore, next: Matrix): void {
  state.set("transform", next);
}

function currentTransform(state: StateStore): Matrix {
  return state.get("transform") as Matrix;
}

/**
 * The drawing-state feature: save/restore, the four transform entry points and
 * the state-owned properties. Value domains follow the support matrix exactly;
 * legal-but-unlisted values are reported, illegal values keep native semantics.
 */
export const stateFeature: FeatureFactory = (environment): FeatureDefinition => {
  const state = environment?.state;
  if (!state)
    throw createCompatError(
      ERROR_CODES.CONTRACT,
      "state feature requires environment.state",
    );
  return {
    id: "state",
    members: {
      save: {
        value() {
          state.save();
        },
      },
      restore: {
        value() {
          state.restore();
        },
      },
      translate: {
        value(...args: readonly unknown[]) {
          const values = coordinates("translate", args, 2, true);
          if (!values) return;
          const current = currentTransform(state);
          // Chromium skips translate when the current transform is not invertible.
          if (current[0] * current[3] - current[1] * current[2] === 0) return;
          transform(
            state,
            translateBy(current, values[0]!, values[1]!),
          );
        },
      },
      rotate: {
        value(...args: readonly unknown[]) {
          const values = coordinates("rotate", args, 1, false);
          if (values)
            transform(state, rotateBy(currentTransform(state), values[0]!));
        },
      },
      scale: {
        value(...args: readonly unknown[]) {
          const values = coordinates("scale", args, 2, true);
          if (values)
            transform(
              state,
              scaleBy(currentTransform(state), values[0]!, values[1]!),
            );
        },
      },
      setTransform: {
        value(...args: readonly unknown[]) {
          if (args.length >= 6) {
            const values = coordinates("setTransform", args, 6, true);
            if (values) {
              const [a, b, c, d, e, f] = values as [
                number,
                number,
                number,
                number,
                number,
                number,
              ];
              // Chromium preserves -0 in a/b/c/d but normalizes e/f to +0.
              transform(state, [a, b, c, d, e + 0, f + 0] as Matrix);
            }
          } else if (args.length <= 1) {
            // The support matrix approves only the six-argument form. The omitted
            // and DOMMatrix2DInit forms are spec-legal, so they are reported as
            // unsupported-api; dictionary conversion rejects primitives with a
            // native TypeError.
            const value = args[0];
            if (
              args.length === 0 ||
              value === undefined ||
              value === null ||
              typeof value === "object" ||
              typeof value === "function"
            )
              unsupported("setTransform overload");
            throw new TypeError(
              "Failed to execute 'setTransform' on 'CanvasRenderingContext2D': The provided value is not of type 'DOMMatrix2DInit'.",
            );
          } else {
            coordinates("setTransform", args, 6, false);
          }
        },
      },
      globalAlpha: {
        get() {
          return state.get("alpha");
        },
        set(value: unknown) {
          const alpha = +(value as number);
          if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return;
          state.set("alpha", alpha);
        },
      },
      lineWidth: {
        get() {
          return state.get("lineWidth");
        },
        set(value: unknown) {
          const width = +(value as number);
          if (!Number.isFinite(width) || width <= 0) return;
          state.set("lineWidth", width);
        },
      },
      lineCap: {
        get() {
          return state.get("lineCap");
        },
        set(value: unknown) {
          const cap = `${value}`;
          if (cap === "butt" || cap === "round") state.set("lineCap", cap);
          else if (cap === "square") unsupported("lineCap value: square");
        },
      },
      lineJoin: {
        get() {
          return state.get("lineJoin");
        },
        set(value: unknown) {
          const join = `${value}`;
          if (join === "round") state.set("lineJoin", join);
          else if (join === "miter" || join === "bevel")
            unsupported(`lineJoin value: ${join}`);
        },
      },
    },
  };
};
