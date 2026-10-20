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

/**
 * Chromium 156 accepts the CSS spelling "normal" and normalizes it to
 * "source-over" (getter reads back "source-over", rendering is byte-identical);
 * only the exact lowercase token qualifies — "Normal", "NORMAL" and
 * " normal " are ignored like any unknown value. Matching that alias keeps
 * `ctx.globalCompositeOperation = "normal"`, common in games ported from CSS,
 * from throwing where native succeeds.
 */
const NORMAL_ALIAS = "normal";

/**
 * Spec-recognized operators the support matrix does not cover. "normal" is
 * absent here because it is not reported at all: Chromium accepts it as the
 * CSS spelling of source-over (see NORMAL_ALIAS below), so it is handled as an
 * accepted input alias rather than a legal-but-unsupported value.
 */
const RECOGNIZED_MODES: ReadonlySet<string> = new Set([
  "clear", "copy", "destination-over", "destination-in", "destination-out",
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

  function classifyFilter(
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    value: string,
  ): boolean {
    context.filter = "none";
    context.filter = value;
    if (context.filter !== "none") return true;
    context.filter = "brightness(120%)";
    context.filter = value;
    return context.filter !== "brightness(120%)";
  }

  function isLegalFilterList(value: string): boolean {
    if (parser) return classifyFilter(parser, value);
    const canvas = environment.createOffscreenCanvas?.(1, 1);
    const context = canvas?.getContext("2d");
    // Platforms whose offscreen 2D context has no `filter` cannot classify
    // supported, malformed or unsupported lists at all; report the missing
    // capability instead of guessing. The public factory normally proves this
    // ability up front, so this only guards an injected/future platform.
    if (!canvas || !context || !("filter" in context)) {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      throw createCompatError(ERROR_CODES.CAPABILITY, "native filter parser is unavailable");
    }
    const release = () => {
      canvas.width = 0;
      canvas.height = 0;
    };
    // After disposal the owner has already drained, so a cached parser would
    // never be released. Classify with a throwaway canvas and release it
    // immediately instead of registering into the released owner.
    if (environment.gpu?.status === "disposed") {
      try {
        return classifyFilter(context, value);
      } finally {
        release();
      }
    }
    parser = context;
    environment.resources.register(() => {
      release();
      parser = null;
    });
    return classifyFilter(parser, value);
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
          } else if (mode === NORMAL_ALIAS) {
            state.set("composite", "source-over");
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
