import type { CompatGradient, CompatPattern, PaintStyle } from "../api.js";
import type {
  FeatureDefinition,
  FeatureEnvironment,
  PaintRef,
} from "../internal/contracts.js";
import { ERROR_CODES, createCompatError } from "../contracts/errors.js";
import { classifyColorValue, parseSupportedColor } from "./color.js";
import { LinearGradientPaint, isCompatGradient } from "./gradient.js";
import { webidlDouble, webidlString } from "./native-error.js";
import { createRepeatPattern, isCompatPattern } from "./pattern.js";
import { DEFAULT_STYLE_IDS, SolidPaint } from "./solid.js";

/** A PaintRef carrying the value the fillStyle/strokeStyle getter returns. */
export interface StylePaintRef extends PaintRef {
  readonly publicValue: PaintStyle;
}

/**
 * State-store seam owned by this feature (consumed by the state ticket):
 * keys "fill" and "stroke" hold live StylePaintRef objects. Gradients keep
 * only their user-space endpoints; the draw-time transform reaches consumers
 * through DrawState.transform, so creation reads nothing beyond those keys.
 */
export const PAINT_STATE_KEYS = Object.freeze({
  fill: "fill",
  stroke: "stroke",
});

type StyleMember = "fillStyle" | "strokeStyle";

/**
 * Installs fillStyle, strokeStyle, createLinearGradient and createPattern.
 * Paint objects are per-canvas: ids are unique within one canvas instance,
 * as the Paint contract requires.
 */
export function paintFeature(environment: FeatureEnvironment): FeatureDefinition {
  const state = environment.state;
  // Ids at or below DEFAULT_STYLE_IDS.stroke are reserved for the default
  // fill/stroke styles installed by the state ticket.
  let nextPaintId = DEFAULT_STYLE_IDS.stroke + 1;
  const allocId = (): number => nextPaintId++;

  const keyOf = (member: StyleMember): string =>
    member === "fillStyle" ? PAINT_STATE_KEYS.fill : PAINT_STATE_KEYS.stroke;

  function readStyle(member: StyleMember): StylePaintRef | undefined {
    return state.get(keyOf(member)) as StylePaintRef | undefined;
  }

  function setStyle(member: StyleMember, value: unknown): void {
    if (isCompatGradient(value) || isCompatPattern(value)) {
      // Branded public types hide the PaintRef implementation; the runtime
      // objects are the live references created by this module.
      state.set(keyOf(member), value as unknown as PaintRef);
      return;
    }
    const text = webidlString(value);
    const parsed = parseSupportedColor(text);
    if (parsed === null) {
      if (classifyColorValue(text) === "unsupported") {
        throw createCompatError(
          ERROR_CODES.UNSUPPORTED_API,
          `${member}: color value outside the supported set: ${text}`,
        );
      }
      return; // Invalid strings are ignored, keeping the previous value.
    }
    state.set(
      keyOf(member),
      new SolidPaint(allocId(), parsed.color, parsed.canonical),
    );
  }

  function getStyle(member: StyleMember): PaintStyle {
    return readStyle(member)?.publicValue ?? "#000000";
  }

  function createLinearGradient(
    x0?: unknown,
    y0?: unknown,
    x1?: unknown,
    y1?: unknown,
  ): CompatGradient {
    const arity = arguments.length;
    if (arity < 4) {
      throw new TypeError(
        `Failed to execute 'createLinearGradient' on 'CanvasRenderingContext2D': 4 arguments required, but only ${arity} present.`,
      );
    }
    const coords = [x0, y0, x1, y1].map((value) => webidlDouble(value)) as [
      number,
      number,
      number,
      number,
    ];
    if (coords.some((value) => !Number.isFinite(value))) {
      throw new TypeError(
        "Failed to execute 'createLinearGradient' on 'CanvasRenderingContext2D': The provided double value is non-finite.",
      );
    }
    return new LinearGradientPaint(
      allocId(),
      [coords[0], coords[1]],
      [coords[2], coords[3]],
    ).publicValue;
  }

  function createPattern(
    image?: unknown,
    repetition?: unknown,
  ): CompatPattern | null {
    return createRepeatPattern(image, repetition, arguments.length, allocId)
      ?.publicValue ?? null;
  }

  const members: Readonly<Record<string, PropertyDescriptor>> = {
    fillStyle: {
      get: () => getStyle("fillStyle"),
      set: (value: unknown) => {
        setStyle("fillStyle", value);
      },
    },
    strokeStyle: {
      get: () => getStyle("strokeStyle"),
      set: (value: unknown) => {
        setStyle("strokeStyle", value);
      },
    },
    createLinearGradient: { value: createLinearGradient },
    createPattern: { value: createPattern },
  };
  return { id: "paint", members };
}
