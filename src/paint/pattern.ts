import type { CompatPattern, NativeCanvas } from "../api.js";
import type { Paint, PaintRef, PatternBitmap } from "../internal/contracts.js";
import { ERROR_CODES, createCompatError } from "../contracts/errors.js";
import { nativeException, webidlString } from "./native-error.js";

const registry = new WeakSet<object>();
export function isCompatPattern(value: unknown): value is CompatPattern {
  return typeof value === "object" && value !== null && registry.has(value);
}

const REPETITIONS = new Set(["repeat", "repeat-x", "repeat-y", "no-repeat"]);

/**
 * Repeat-only pattern holding the frozen bitmap descriptor captured at
 * creation (decision #36): native captures the bitmap when createPattern
 * runs, so later img.src swaps are never observed. The descriptor is deeply
 * frozen (all primitives) and the canonical pixels stay module-private, so
 * the pattern is immutable and id+version (version stays 0: the recorded
 * fields never change) is again a sufficient key for derived GPU/raster
 * material.
 */
export class RepeatPatternPaint implements PaintRef {
  readonly version = 0;

  constructor(
    readonly id: number,
    readonly image: PatternBitmap,
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
    }) as Paint;
  }
}

/**
 * Canonical pattern pixels live outside the PatternBitmap descriptor: the
 * descriptor is all primitives so freezing it is deep, and the only
 * Uint8ClampedArray is reachable solely through this module-private map.
 * Callers receive the descriptor (RepeatPatternPaint.image, Paint snapshots)
 * and can never reach — let alone mutate — the canonical bytes, so
 * id+version stays a sufficient cache key for derived material.
 */
const canonicalPixels = new WeakMap<PatternBitmap, Uint8ClampedArray>();

/**
 * Define a captured pattern bitmap: the payload is copied (the caller may
 * reuse or mutate its own buffer afterwards), the descriptor is frozen, and
 * the canonical bytes are registered for internal consumers. Creation-time
 * only; never on a per-draw path.
 */
export function definePatternBitmap(
  width: number,
  height: number,
  data: Uint8ClampedArray,
): PatternBitmap {
  const bitmap = Object.freeze({
    width,
    height,
    colorSpace: "srgb",
    alpha: "straight",
  }) as PatternBitmap;
  canonicalPixels.set(bitmap, new Uint8ClampedArray(data));
  return bitmap;
}

/** Zero-copy canonical pixels for GPU upload and raster replay. */
export function patternBitmapPixels(bitmap: PatternBitmap): Uint8ClampedArray {
  const pixels = canonicalPixels.get(bitmap);
  if (!pixels)
    throw createCompatError(
      ERROR_CODES.CONTRACT,
      "pattern bitmap was not created by definePatternBitmap",
    );
  return pixels;
}

/** Registry membership is the brand; no structural field can be forged. */
export function isPatternBitmap(value: unknown): value is PatternBitmap {
  return (
    typeof value === "object" &&
    value !== null &&
    canonicalPixels.has(value as PatternBitmap)
  );
}

/**
 * Synchronously capture the image's current bitmap through the
 * platform-injected offscreen factory: draw at natural size, read the
 * straight sRGB pixels back, and freeze the owned descriptor. The factory
 * and a 2D context on its product are required capabilities — their absence
 * fails capability-unavailable instead of silently degrading to a live image
 * reference. A tainted source makes getImageData throw SecurityError, which
 * propagates unchanged (intentional deviation from the native timing, which
 * defers the failure to readback; decision #41). Whatever happens, the
 * scratch canvas is released on the way out; getImageData has already copied
 * the pixels on the success path.
 */
function capturePatternBitmap(
  image: HTMLImageElement,
  width: number,
  height: number,
  createCanvas: ((width: number, height: number) => NativeCanvas) | undefined,
): PatternBitmap {
  if (!createCanvas)
    throw createCompatError(
      ERROR_CODES.CAPABILITY,
      "createPattern: offscreen canvas factory is unavailable",
    );
  const canvas = createCanvas(width, height);
  try {
    const context = canvas.getContext("2d");
    if (!context)
      throw createCompatError(
        ERROR_CODES.CAPABILITY,
        "createPattern: offscreen 2D context is unavailable",
      );
    context.drawImage(image, 0, 0);
    const captured = context.getImageData(0, 0, width, height);
    return definePatternBitmap(width, height, captured.data);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
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
 * outcome; everything else keeps native exception types. Only a genuinely
 * creatable pattern reaches the bitmap capture, so the missing-factory
 * capability failure never masks a native input error.
 */
export function createRepeatPattern(
  image: unknown,
  repetition: unknown,
  arity: number,
  allocId: () => number,
  createCanvas?: (width: number, height: number) => NativeCanvas,
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
      capturePatternBitmap(
        image as HTMLImageElement,
        source.naturalWidth,
        source.naturalHeight,
        createCanvas,
      ),
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
