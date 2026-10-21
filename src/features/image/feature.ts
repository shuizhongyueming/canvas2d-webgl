import type { ImageSource, NativeCanvas } from "../../api.js";
import type {
  Bounds,
  FeatureDefinition,
  FeatureFactory,
  Matrix,
} from "../../internal/contracts.js";
import { createCompatError, ERROR_CODES } from "../../contracts/errors.js";
import { nativeException, webidlDouble } from "../../paint/native-error.js";
import { isCompatCanvas } from "../../canvas/facade.js";

/**
 * drawImage with the 3/5/9-argument overloads for HTMLImageElement and native
 * canvas sources. The feature owns argument conversion, source classification
 * and the proportional source-rectangle clip; upload, blending and transform
 * math stay in the shared GPU device, which consumes every external source
 * synchronously at call time (IMG-01/IMG-02: no caching, no dirty marking, no
 * deferred sampling). Compat canvases and the context's own target are
 * rejected as unsupported-api (IMG-03); other native source kinds outside the
 * support matrix report the same, while genuinely invalid values keep the
 * native TypeError. Nothing about the source is retained after the call.
 */

const TYPE_MESSAGE =
  "Failed to execute 'drawImage' on 'CanvasRenderingContext2D': The provided value is not of type '(CSSImageValue or HTMLCanvasElement or HTMLImageElement or HTMLVideoElement or ImageBitmap or OffscreenCanvas or SVGImageElement or VideoFrame)'.";

/**
 * Cross-realm DOM brand check; survives where instanceof against one realm
 * fails. Genuine DOM wrappers inherit Symbol.toStringTag from their interface
 * prototype, so an own tag marks a forged plain object, which the native
 * method rejects as not a CanvasImageSource.
 */
function hasDomTag(value: object, tag: string): boolean {
  return (
    Object.prototype.toString.call(value) === `[object ${tag}]` &&
    !Object.prototype.hasOwnProperty.call(value, Symbol.toStringTag)
  );
}

function globalInstanceof(value: object, name: string): boolean {
  const ctor = (globalThis as Record<string, unknown>)[name];
  return (
    typeof ctor === "function" && value instanceof (ctor as new () => object)
  );
}

function isImageElement(value: object): value is HTMLImageElement {
  return (
    globalInstanceof(value, "HTMLImageElement") ||
    hasDomTag(value, "HTMLImageElement")
  );
}

function isCanvasElement(value: object): value is NativeCanvas {
  return (
    globalInstanceof(value, "HTMLCanvasElement") ||
    globalInstanceof(value, "OffscreenCanvas") ||
    hasDomTag(value, "HTMLCanvasElement") ||
    hasDomTag(value, "OffscreenCanvas")
  );
}

/** Natively legal CanvasImageSource kinds the support matrix does not approve. */
function isOtherNativeSource(value: object): boolean {
  for (const name of [
    "CSSImageValue",
    "HTMLVideoElement",
    "ImageBitmap",
    "SVGImageElement",
    "VideoFrame",
  ])
    if (globalInstanceof(value, name) || hasDomTag(value, name)) return true;
  return false;
}

type Classified =
  | Readonly<{ outcome: "image"; image: HTMLImageElement }>
  | Readonly<{ outcome: "canvas"; canvas: NativeCanvas }>
  | Readonly<{ outcome: "rejected"; message: string }>;

/** Device-space axis-aligned hull of a user-space rect under the transform. */
function deviceBounds(rect: Bounds, transform: Matrix): Bounds {
  const [a, b, c, d, e, f] = transform;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cornerX of [rect.x, rect.x + rect.width])
    for (const cornerY of [rect.y, rect.y + rect.height]) {
      const deviceX = a * cornerX + c * cornerY + e;
      const deviceY = b * cornerX + d * cornerY + f;
      if (deviceX < minX) minX = deviceX;
      if (deviceX > maxX) maxX = deviceX;
      if (deviceY < minY) minY = deviceY;
      if (deviceY > maxY) maxY = deviceY;
    }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Clip one source axis to [0, limit] in the shared affine parameter t, where
 * source = s0 + t*(s1-s0) maps to destination = d0 + t*(d1-d0).
 * Source and destination extents have already been normalized.
 */
function clipAxis(
  s0: number,
  s1: number,
  limit: number,
): readonly [number, number] | null {
  const span = s1 - s0;
  let low = (0 - s0) / span;
  let high = (limit - s0) / span;
  if (low > high) [low, high] = [high, low];
  const t0 = Math.max(0, low);
  const t1 = Math.min(1, high);
  return t0 < t1 ? [t0, t1] : null;
}

export const imageFeature: FeatureFactory = (
  environment,
): FeatureDefinition => {
  const state = environment?.state;
  const gpu = environment?.gpu;
  const target = environment?.target;
  if (!state || !gpu || !target)
    throw createCompatError(
      ERROR_CODES.CONTRACT,
      "image feature requires environment.state, gpu and target",
    );

  /**
   * Classify the image argument in WebIDL conversion order. Only values that
   * are not CanvasImageSource at all fail with the native TypeError here;
   * approved-but-unsupported sources (compat facade, own target, other native
   * kinds) defer to an unsupported-api report after coordinate conversion,
   * matching the phase in which a native implementation would reject them.
   */
  function classify(value: unknown): Classified {
    if (typeof value !== "object" || value === null)
      throw new TypeError(TYPE_MESSAGE);
    if (value === target)
      return {
        outcome: "rejected",
        message: "drawImage: canvas is its own source",
      };
    if (isCompatCanvas(value))
      return {
        outcome: "rejected",
        message: "drawImage: compat canvas source",
      };
    if (isImageElement(value)) return { outcome: "image", image: value };
    if (isCanvasElement(value)) return { outcome: "canvas", canvas: value };
    if (isOtherNativeSource(value))
      return {
        outcome: "rejected",
        message: "drawImage: image source type outside the support matrix",
      };
    throw new TypeError(TYPE_MESSAGE);
  }

  /** While lost, drawing is silently ineffective and never queued (LIFE-02). */
  function assertUsable(): boolean {
    if (gpu.status === "disposed")
      throw createCompatError(ERROR_CODES.DISPOSED, "canvas is disposed");
    return gpu.status === "active";
  }

  function drawImage(...args: readonly unknown[]): void {
    const count = args.length;
    if (count < 3)
      throw new TypeError(
        `Failed to execute 'drawImage' on 'CanvasRenderingContext2D': 3 arguments required, but only ${count} present.`,
      );
    if (count !== 3 && count !== 5 && count < 9)
      throw new TypeError(
        "Failed to execute 'drawImage' on 'CanvasRenderingContext2D': Overload resolution failed.",
      );
    const source = classify(args[0]);
    // WebIDL converts every double before the method body runs, so BigInt and
    // Symbol reject here even when an earlier coordinate is non-finite.
    const values = args.slice(1, 9).map(webidlDouble);
    if (source.outcome === "rejected")
      throw createCompatError(ERROR_CODES.UNSUPPORTED_API, source.message);
    if (!values.every((value) => Number.isFinite(value))) return;
    const intrinsicWidth =
      source.outcome === "image"
        ? source.image.naturalWidth
        : source.canvas.width;
    const intrinsicHeight =
      source.outcome === "image"
        ? source.image.naturalHeight
        : source.canvas.height;
    if (source.outcome === "image") {
      const image = source.image;
      // Usability: pending or source-less images draw nothing; a broken one
      // throws, exactly like the native check-the-usability steps.
      if (image.complete === false) return;
      if (!(intrinsicWidth > 0 && intrinsicHeight > 0)) {
        const hasSource =
          (typeof image.currentSrc === "string" && image.currentSrc !== "") ||
          (typeof image.src === "string" && image.src !== "");
        if (hasSource)
          throw nativeException(
            "InvalidStateError",
            11,
            "Failed to execute 'drawImage' on 'CanvasRenderingContext2D': The image argument is an HTMLImageElement with no usable image data.",
          );
        return;
      }
    } else if (!(intrinsicWidth > 0 && intrinsicHeight > 0)) {
      throw nativeException(
        "InvalidStateError",
        11,
        "Failed to execute 'drawImage' on 'CanvasRenderingContext2D': The image argument is a canvas element with a width or height of 0.",
      );
    }
    let sx = 0;
    let sy = 0;
    let sw = intrinsicWidth;
    let sh = intrinsicHeight;
    let dx = values[0]!;
    let dy = values[1]!;
    let dw = sw;
    let dh = sh;
    if (count === 5) {
      dw = values[2]!;
      dh = values[3]!;
    } else if (count >= 9) {
      [sx, sy, sw, sh, dx, dy, dw, dh] = values as [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ];
    }
    if (sw === 0 || sh === 0 || dw === 0 || dh === 0) return;
    if (sw < 0) {
      sx += sw;
      sw = -sw;
    }
    if (sh < 0) {
      sy += sh;
      sh = -sh;
    }
    if (dw < 0) {
      dx += dw;
      dw = -dw;
    }
    if (dh < 0) {
      dy += dh;
      dh = -dh;
    }
    // Clip the source rectangle to the image and the destination in the same
    // proportion; an empty intersection means nothing is visible.
    const xt = clipAxis(sx, sx + sw, intrinsicWidth);
    const yt = clipAxis(sy, sy + sh, intrinsicHeight);
    if (!xt || !yt) return;
    const sourceRect: Bounds = {
      x: sx + xt[0] * sw,
      y: sy + yt[0] * sh,
      width: (xt[1] - xt[0]) * sw,
      height: (yt[1] - yt[0]) * sh,
    };
    const destinationRect: Bounds = {
      x: dx + xt[0] * dw,
      y: dy + yt[0] * dh,
      width: (xt[1] - xt[0]) * dw,
      height: (yt[1] - yt[0]) * dh,
    };
    if (!assertUsable()) return;
    const snapshot = state.snapshot();
    const image: ImageSource =
      source.outcome === "image" ? source.image : source.canvas;
    gpu.draw({
      generation: gpu.generation,
      kind: "draw",
      state: snapshot,
      source: {
        kind: "image",
        image,
        sourceRect,
        destinationRect,
        transform: snapshot.transform,
      },
      sourceBounds: deviceBounds(destinationRect, snapshot.transform),
      clip: snapshot.clip,
    });
  }

  return {
    id: "image",
    members: {
      drawImage: { value: drawImage },
    },
  };
};
