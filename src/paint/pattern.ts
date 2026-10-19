import type { CompatPattern } from "../api.js";
import type { Paint, PaintRef } from "../internal/contracts.js";
import { ERROR_CODES, createCompatError } from "../contracts/errors.js";
import { nativeException, webidlString } from "./native-error.js";

const registry = new WeakSet<object>();
export function isCompatPattern(value: unknown): value is CompatPattern {
  return typeof value === "object" && value !== null && registry.has(value);
}

const REPETITIONS = new Set(["repeat", "repeat-x", "repeat-y", "no-repeat"]);

/**
 * Repeat-only pattern holding the live image plus its creation-time
 * dimensions. Native captures the bitmap at creation (later img.src swaps
 * are not observed); this reference does NOT capture it yet — bitmap capture
 * ownership and the Paint.image contract shape are decided by issue #36.
 * Until then id+version must not key derived GPU/raster material across src
 * swaps. version stays 0 because the recorded fields never change.
 */
export class RepeatPatternPaint implements PaintRef {
  readonly version = 0;

  constructor(
    readonly id: number,
    readonly image: HTMLImageElement,
    readonly width: number,
    readonly height: number,
  ) {
    registry.add(this);
  }

  get publicValue(): CompatPattern {
    return this as unknown as CompatPattern;
  }

  /** pattern.setTransform is an explicitly unsupported matrix member. */
  setTransform(): never {
    throw createCompatError(
      ERROR_CODES.UNSUPPORTED_API,
      "pattern.setTransform",
    );
  }

  snapshot(): Paint {
    return Object.freeze({
      kind: "repeat-pattern",
      id: this.id,
      version: this.version,
      image: this.image,
      width: this.width,
      height: this.height,
    }) as Paint;
  }
}

function globalInstanceof(value: object, name: string): boolean {
  const ctor = (globalThis as Record<string, unknown>)[name];
  return typeof ctor === "function" && value instanceof (ctor as new () => object);
}

/**
 * Cross-realm brand check: DOM interface objects carry a Symbol.toStringTag
 * that survives across realms, unlike instanceof against one realm's ctor
 * (native createPattern accepts cross-realm images and canvases).
 */
function hasDomTag(value: object, tag: string): boolean {
  return Object.prototype.toString.call(value) === `[object ${tag}]`;
}

function isCanvasLike(value: object): boolean {
  return (
    globalInstanceof(value, "HTMLCanvasElement") ||
    globalInstanceof(value, "OffscreenCanvas") ||
    hasDomTag(value, "HTMLCanvasElement") ||
    hasDomTag(value, "OffscreenCanvas")
  );
}

function isImageElementLike(value: object): boolean {
  if (globalInstanceof(value, "HTMLImageElement")) return true;
  if (hasDomTag(value, "HTMLImageElement")) return true;
  // Structural fallback only where no DOM brand exists (non-DOM platforms,
  // Node unit tests); browsers reject plain objects with a TypeError.
  const ctor = (globalThis as Record<string, unknown>).HTMLImageElement;
  if (typeof ctor === "function") return false;
  const candidate = value as {
    complete?: unknown;
    naturalWidth?: unknown;
    naturalHeight?: unknown;
  };
  return (
    typeof candidate.complete === "boolean" &&
    typeof candidate.naturalWidth === "number" &&
    typeof candidate.naturalHeight === "number"
  );
}

function isOtherNativeImageSource(value: object): boolean {
  for (const name of [
    "ImageBitmap",
    "SVGImageElement",
    "HTMLVideoElement",
    "VideoFrame",
    "CSSImageValue",
  ]) {
    if (globalInstanceof(value, name)) return true;
  }
  return false;
}

/**
 * createPattern(image, "repeat") with native error ordering (Chromium probe
 * evidence on issue #15): arity -> image type -> repetition -> usability.
 * Canvas sources and non-repeat modes are legal native values outside the
 * support matrix, so they fail with unsupported-api instead of the native
 * outcome; everything else keeps native exception types.
 */
export function createRepeatPattern(
  image: unknown,
  repetition: unknown,
  arity: number,
  allocId: () => number,
): RepeatPatternPaint | null {
  if (arity < 2) {
    throw new TypeError(
      `Failed to execute 'createPattern' on 'CanvasRenderingContext2D': 2 arguments required, but only ${arity} present.`,
    );
  }
  if (typeof image !== "object" || image === null) {
    throw new TypeError(
      "Failed to execute 'createPattern' on 'CanvasRenderingContext2D': The provided value is not of type '(CSSImageValue or HTMLCanvasElement or HTMLImageElement or HTMLVideoElement or ImageBitmap or OffscreenCanvas or SVGImageElement or VideoFrame)'.",
    );
  }
  if (isCanvasLike(image)) {
    throw createCompatError(
      ERROR_CODES.UNSUPPORTED_API,
      "createPattern: canvas image source",
    );
  }
  if (!isImageElementLike(image)) {
    if (isOtherNativeImageSource(image)) {
      throw createCompatError(
        ERROR_CODES.UNSUPPORTED_API,
        "createPattern: image source type outside the support matrix",
      );
    }
    throw new TypeError(
      "Failed to execute 'createPattern' on 'CanvasRenderingContext2D': The provided value is not of type '(CSSImageValue or HTMLCanvasElement or HTMLImageElement or HTMLVideoElement or ImageBitmap or OffscreenCanvas or SVGImageElement or VideoFrame)'.",
    );
  }
  let mode: string;
  if (repetition === null || repetition === "") {
    mode = "repeat";
  } else {
    mode = webidlString(repetition);
  }
  if (!REPETITIONS.has(mode)) {
    throw nativeException(
      "SyntaxError",
      12,
      `Failed to execute 'createPattern' on 'CanvasRenderingContext2D': The provided type ('${mode}') is not one of 'repeat', 'no-repeat', 'repeat-x', or 'repeat-y'.`,
    );
  }
  if (mode !== "repeat") {
    throw createCompatError(
      ERROR_CODES.UNSUPPORTED_API,
      `createPattern: repetition "${mode}"`,
    );
  }
  const source = image as {
    complete: boolean;
    naturalWidth: number;
    naturalHeight: number;
    currentSrc?: unknown;
    src?: unknown;
  };
  if (source.complete === false) return null;
  if (typeof source.naturalWidth === "number" && source.naturalWidth > 0) {
    return new RepeatPatternPaint(
      allocId(),
      image as HTMLImageElement,
      source.naturalWidth,
      source.naturalHeight,
    );
  }
  const hasSource =
    (typeof source.currentSrc === "string" && source.currentSrc !== "") ||
    (typeof source.src === "string" && source.src !== "");
  if (source.complete === true && hasSource) {
    throw nativeException(
      "InvalidStateError",
      11,
      "Failed to execute 'createPattern' on 'CanvasRenderingContext2D': Source image is in the 'broken' state.",
    );
  }
  return null;
}
