import type { CompatPattern } from "../api.js";
import type { Paint, PaintRef } from "../internal/contracts.js";
import { ERROR_CODES, createCompatError } from "../contracts/errors.js";
import { nativeException } from "./native-error.js";

const registry = new WeakSet<object>();
export function isCompatPattern(value: unknown): value is CompatPattern {
  return typeof value === "object" && value !== null && registry.has(value);
}

const REPETITIONS = new Set(["repeat", "repeat-x", "repeat-y", "no-repeat"]);

/**
 * Immutable repeat-only pattern. The image bitmap is captured at creation
 * (later img.src swaps are not observed, matching native), so version stays 0
 * and id+version safely key any derived GPU/raster material.
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

function isCanvasLike(value: object): boolean {
  if (
    typeof (value as { getContext?: unknown }).getContext === "function" ||
    globalInstanceof(value, "HTMLCanvasElement") ||
    globalInstanceof(value, "OffscreenCanvas")
  ) {
    return true;
  }
  return false;
}

function isImageElementLike(value: object): boolean {
  if (globalInstanceof(value, "HTMLImageElement")) return true;
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
    "ImageData",
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
    mode = String(repetition);
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
