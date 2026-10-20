import type { CompositeMode } from "../../api.js";
import type {
  FeatureDefinition,
  FeatureFactory,
} from "../../internal/contracts.js";
import { createCompatError, ERROR_CODES } from "../../contracts/errors.js";

/**
 * Compositing state: globalCompositeOperation and filter. The properties only
 * record the drawing state here; the GPU device turns them into blend factors
 * and the brightness fragment transfer (one Canvas call is one composite
 * unit, independent of the source kind). Value domains follow the support
 * matrix: unrecognized spellings are ignored like native, spec-legal values
 * outside the matrix are reported as unsupported-api.
 */

function unsupported(detail: string): never {
  throw createCompatError(ERROR_CODES.UNSUPPORTED_API, detail);
}

const SUPPORTED_MODES: ReadonlySet<string> = new Set([
  "source-over",
  "source-atop",
  "source-in",
  "lighter",
]);

/** Spec-recognized operators the support matrix does not cover. */
const RECOGNIZED_MODES: ReadonlySet<string> = new Set([
  "clear", "copy", "normal", "destination-over", "destination-in", "destination-out",
  "destination-atop", "source-out", "xor", "multiply", "screen", "overlay",
  "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light",
  "difference", "exclusion", "hue", "saturation", "color", "luminosity",
]);

export const compositeFeature: FeatureFactory = (
  environment,
): FeatureDefinition => {
  const state = environment?.state;
  if (!state)
    throw createCompatError(
      ERROR_CODES.CONTRACT,
      "composite feature requires environment.state",
    );
  let parser: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  function isLegalFilterList(value: string): boolean {
    if (!parser) {
      const canvas = environment.createOffscreenCanvas?.(1, 1);
      const context = canvas?.getContext("2d");
      if (!canvas || !context || !("filter" in context)) {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        throw createCompatError(ERROR_CODES.CAPABILITY, "native filter parser is unavailable");
      }
      parser = context;
      environment.resources.register(() => {
        canvas.width = 0;
        canvas.height = 0;
        parser = null;
      });
    }
    parser.filter = "none";
    parser.filter = value;
    if (parser.filter !== "none") return true;
    parser.filter = "brightness(120%)";
    parser.filter = value;
    return parser.filter !== "brightness(120%)";
  }
  return {
    id: "composite",
    members: {
      globalCompositeOperation: {
        get() {
          return state.get("composite");
        },
        set(value: unknown) {
          // WebIDL DOMString conversion: Symbol rejects with a TypeError.
          const mode = `${value}`;
          if (SUPPORTED_MODES.has(mode)) {
            state.set("composite", mode as CompositeMode);
          } else if (RECOGNIZED_MODES.has(mode)) {
            unsupported(`globalCompositeOperation value: ${mode}`);
          }
          // Unrecognized spellings leave the current value, like native.
        },
      },
      filter: {
        get() {
          return state.get("filter");
        },
        set(value: unknown) {
          const filter = `${value}`;
          if (filter === "none" || filter === "brightness(120%)") {
            state.set("filter", filter);
          } else if (isLegalFilterList(filter)) {
            unsupported(`filter value: ${filter}`);
          }
          // Unparseable filter lists leave the current value, like native.
        },
      },
    },
  };
};
