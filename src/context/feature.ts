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

/** WebIDL argument conversion: missing arguments are TypeErrors, non-finite values are ignored. */
function coordinates(
  name: string,
  args: readonly unknown[],
  required: number,
): number[] | null {
  if (args.length < required)
    throw new TypeError(
      `Failed to execute '${name}' on 'CanvasRenderingContext2D': ${required} arguments required, but only ${args.length} present.`,
    );
  const values = args.slice(0, required).map((value) => Number(value));
  return values.every((value) => Number.isFinite(value)) ? values : null;
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
          const values = coordinates("translate", args, 2);
          if (values)
            transform(
              state,
              translateBy(currentTransform(state), values[0]!, values[1]!),
            );
        },
      },
      rotate: {
        value(...args: readonly unknown[]) {
          const values = coordinates("rotate", args, 1);
          if (values)
            transform(state, rotateBy(currentTransform(state), values[0]!));
        },
      },
      scale: {
        value(...args: readonly unknown[]) {
          const values = coordinates("scale", args, 2);
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
            const values = coordinates("setTransform", args, 6);
            if (values)
              transform(state, values as unknown as Matrix);
          } else if (args.length <= 1) {
            // The omitted and DOMMatrix2DInit forms are spec-legal but unapproved;
            // dictionary conversion rejects primitives with a native TypeError.
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
            coordinates("setTransform", args, 6);
          }
        },
      },
      globalAlpha: {
        get() {
          return state.get("alpha");
        },
        set(value: unknown) {
          const alpha = Number(value);
          if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return;
          state.set("alpha", alpha);
        },
      },
      lineWidth: {
        get() {
          return state.get("lineWidth");
        },
        set(value: unknown) {
          const width = Number(value);
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
