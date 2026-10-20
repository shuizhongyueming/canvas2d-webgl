import type {
  CompositeMode,
} from "../../api.js";
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
  "clear",
  "copy",
  "destination",
  "destination-over",
  "destination-in",
  "destination-out",
  "destination-atop",
  "source-out",
  "xor",
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
  "plus-darker",
  "plus-lighter",
]);

const NUMBER = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
const NUMBER_OR_PERCENT = new RegExp(`^${NUMBER}%?$`);
const LENGTH = new RegExp(
  `^(${NUMBER}(px|em|rem|ex|ch|vw|vh|vmin|vmax|cm|mm|in|pt|pc|q)?|0)$`,
  "i",
);
const ANGLE = new RegExp(`^${NUMBER}(deg|grad|rad|turn)$`, "i");

function filterArguments(name: string, args: string): boolean {
  switch (name) {
    case "blur":
      return LENGTH.test(args);
    case "brightness":
    case "contrast":
    case "saturate":
      return NUMBER_OR_PERCENT.test(args);
    case "grayscale":
    case "invert":
    case "opacity":
    case "sepia":
      return NUMBER_OR_PERCENT.test(args);
    case "hue-rotate":
      return ANGLE.test(args);
    case "drop-shadow":
    case "url":
      return args.length > 0;
    default:
      return false;
  }
}

/**
 * Whether the value parses as a CSS <filter-value-list> (and is therefore
 * spec-legal but outside the support matrix). Parse failures are ignored by
 * native and by us. Function arguments are validated per grammar; url() with
 * nested parentheses is treated as a parse failure.
 */
function isLegalFilterList(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  let tokens = 0;
  let valid = 0;
  const rest = trimmed.replace(
    /([a-zA-Z][a-zA-Z-]*)\(([^()]*)\)/g,
    (whole, name: string, args: string) => {
      tokens += 1;
      if (filterArguments(name.toLowerCase(), args.trim())) valid += 1;
      return " ";
    },
  );
  return tokens > 0 && tokens === valid && rest.trim() === "";
}

export const compositeFeature: FeatureFactory = (
  environment,
): FeatureDefinition => {
  const state = environment?.state;
  if (!state)
    throw createCompatError(
      ERROR_CODES.CONTRACT,
      "composite feature requires environment.state",
    );
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
