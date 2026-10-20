import type { NativeCanvas } from "../api.js";
import type {
  Bounds,
  DrawState,
  Paint,
  PathSnapshot,
  PatternBitmap,
  RasterSource,
  Rasterizer,
} from "../internal/contracts.js";
import { createCompatError, ERROR_CODES } from "../contracts/errors.js";
import { RasterCache } from "./cache.js";
import type { RasterLease } from "./cache.js";
import { pathGeometryBounds } from "./bounds.js";
import {
  alignOutset,
  applyPoint,
  offsetMatrix,
  scaleBound,
} from "./matrix.js";
import { context2d, destroyCanvas } from "./native.js";
import type { Native2DContext } from "./native.js";
import { applyPaint } from "./paint.js";
import { patternBitmapPixels } from "../paint/pattern.js";
import { replayPath } from "./replay.js";

/** Native default; miterLimit is outside the support matrix. */
const MITER_LIMIT = 10;
const DEFAULT_MAX_TEXTURE_DIMENSION = 16384;

export interface RasterizerOptions {
  createCanvas: (width: number, height: number) => NativeCanvas;
  /** Device-pixel extent of the scene the assets will be composited into. */
  sceneExtent: () => { readonly width: number; readonly height: number };
  maxEntries?: number;
  maxPixels?: number;
  maxTextureDimension?: number;
}

interface Asset {
  readonly canvas: NativeCanvas;
  readonly bounds: Bounds;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

function paintKey(paint: Paint): string {
  if (paint.kind === "solid") return `solid:${paint.color.join(",")}`;
  if (paint.kind === "linear-gradient")
    return `linear-gradient:${paint.id}:${paint.version}`;
  return `repeat-pattern:${paint.id}:${paint.version}`;
}

function strokeKey(state: DrawState): string {
  return `${state.lineWidth}|${state.lineCap}|${state.lineJoin}`;
}

function emptyAsset(createCanvas: RasterizerOptions["createCanvas"]): Asset {
  const canvas = createCanvas(1, 1);
  return {
    canvas,
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    pixelWidth: 1,
    pixelHeight: 1,
  };
}

class NativeRasterizer implements Rasterizer {
  readonly #options: RasterizerOptions;
  readonly #cache: RasterCache<Asset>;
  #epoch = 0;
  #disposed = false;
  #measure: { canvas: NativeCanvas; context: Native2DContext } | null = null;
  #stage: { canvas: NativeCanvas; context: Native2DContext } | null = null;
  #patternScratch: { canvas: NativeCanvas; context: Native2DContext } | null =
    null;

  constructor(options: RasterizerOptions) {
    this.#options = options;
    this.#cache = new RasterCache<Asset>({
      maxEntries: options.maxEntries,
      maxPixels: options.maxPixels,
    });
  }

  path(path: PathSnapshot, state: DrawState, mode: "fill" | "stroke"): RasterSource {
    this.#assertLive();
    const key = [
      "path",
      this.#epoch,
      this.#sceneKey(),
      mode,
      path.id,
      state.transform.join(","),
      paintKey(mode === "fill" ? state.fill : state.stroke),
      mode === "stroke" ? strokeKey(state) : "",
    ].join("|");
    const hit = this.#cache.acquire(key);
    if (hit) return this.#toSource(hit);
    const asset = this.#renderPath(path, state, mode);
    const lease =
      this.#cache.store(key, asset, asset.pixelWidth * asset.pixelHeight, (a) =>
        destroyCanvas(a.canvas),
      ) ?? this.#ownLease(asset);
    return this.#toSource(lease);
  }

  text(
    text: string,
    x: number,
    y: number,
    state: DrawState,
    mode: "fill" | "stroke",
  ): RasterSource {
    this.#assertLive();
    const key = [
      "text",
      this.#epoch,
      this.#sceneKey(),
      mode,
      text,
      x,
      y,
      state.font,
      state.textAlign,
      state.textBaseline,
      state.transform.join(","),
      paintKey(mode === "fill" ? state.fill : state.stroke),
      mode === "stroke" ? strokeKey(state) : "",
    ].join("|");
    const hit = this.#cache.acquire(key);
    if (hit) return this.#toSource(hit);
    const asset = this.#renderText(text, x, y, state, mode);
    const lease =
      this.#cache.store(key, asset, asset.pixelWidth * asset.pixelHeight, (a) =>
        destroyCanvas(a.canvas),
      ) ?? this.#ownLease(asset);
    return this.#toSource(lease);
  }

  clip(
    path: PathSnapshot,
    rule: "nonzero" | "evenodd",
    bounds: Bounds,
  ): RasterSource {
    this.#assertLive();
    const key = [
      "clip",
      this.#epoch,
      this.#sceneKey(),
      rule,
      path.id,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
    ].join("|");
    const hit = this.#cache.acquire(key);
    if (hit) return this.#toSource(hit);
    const asset = this.#renderClip(path, rule, bounds);
    const lease =
      this.#cache.store(key, asset, asset.pixelWidth * asset.pixelHeight, (a) =>
        destroyCanvas(a.canvas),
      ) ?? this.#ownLease(asset);
    return this.#toSource(lease);
  }

  measureWidth(text: string, state: DrawState): number {
    this.#assertLive();
    const context = this.#measureContext();
    context.font = state.font;
    context.textAlign = state.textAlign;
    context.textBaseline = state.textBaseline;
    return context.measureText(text).width;
  }

  clearCache(): void {
    this.#epoch += 1;
    this.#cache.clear();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cache.clear();
    if (this.#measure) destroyCanvas(this.#measure.canvas);
    this.#measure = null;
    if (this.#stage) destroyCanvas(this.#stage.canvas);
    this.#stage = null;
    if (this.#patternScratch) destroyCanvas(this.#patternScratch.canvas);
    this.#patternScratch = null;
  }

  #assertLive(): void {
    if (this.#disposed)
      throw createCompatError(ERROR_CODES.DISPOSED, "rasterizer is disposed");
  }

  #measureContext(): Native2DContext {
    if (!this.#measure) {
      const canvas = this.#options.createCanvas(1, 1);
      this.#measure = { canvas, context: context2d(canvas) };
    }
    return this.#measure.context;
  }

  /** Native coverage depends on the canvas extent as well as scene coordinates. */
  #stageContext(
    width: number,
    height: number,
  ): { canvas: NativeCanvas; ctx: Native2DContext } {
    if (!this.#stage) {
      const canvas = this.#options.createCanvas(width, height);
      this.#stage = {
        canvas,
        context: context2d(canvas, { willReadFrequently: true }),
      };
    } else {
      const canvas = this.#stage.canvas;
      if (width !== canvas.width) canvas.width = width;
      if (height !== canvas.height) canvas.height = height;
    }
    const { canvas, context } = this.#stage;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    return { canvas, ctx: context };
  }

  #sceneKey(): string {
    // Bounds are intersected with the scene, so a resize must not serve assets
    // clipped by the previous extent.
    const { width, height } = this.#options.sceneExtent();
    return `${width}x${height}`;
  }

  /**
   * One retained scratch canvas turns a captured pattern bitmap into a native
   * pattern: putImageData the canonical pixels, then createPattern. Native
   * createPattern copies the scratch bitmap synchronously, so a single
   * scratch serves every pattern paint and survives no longer than any other
   * internal canvas. The scratch must match the tile size exactly — resizing
   * resets the bitmap, while an exact-size putImageData overwrites every
   * pixel, so no stale content can leak into the tile either way.
   */
  readonly #patternSource = (bitmap: PatternBitmap): CanvasPattern => {
    if (!this.#patternScratch) {
      const canvas = this.#options.createCanvas(bitmap.width, bitmap.height);
      this.#patternScratch = { canvas, context: context2d(canvas) };
    }
    const { canvas, context } = this.#patternScratch;
    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
    }
    context.putImageData(
      // Canonical pixels come from the paint module's private registry and
      // originate in getImageData, so they are always backed by a regular
      // ArrayBuffer; putImageData copies out immediately.
      new ImageData(
        patternBitmapPixels(bitmap) as Uint8ClampedArray<ArrayBuffer>,
        bitmap.width,
        bitmap.height,
      ),
      0,
      0,
    );
    const pattern = context.createPattern(
      canvas as CanvasImageSource,
      "repeat",
    );
    if (!pattern)
      throw createCompatError(
        ERROR_CODES.CONTRACT,
        "repeat-pattern paint produced no native pattern",
      );
    return pattern;
  };

  #scene(): Bounds {
    const { width, height } = this.#options.sceneExtent();
    return { x: 0, y: 0, width, height };
  }

  #ownLease(asset: Asset): RasterLease<Asset> {
    let released = false;
    return {
      value: asset,
      release: () => {
        if (released) return;
        released = true;
        destroyCanvas(asset.canvas);
      },
    };
  }

  #toSource(lease: RasterLease<Asset>): RasterSource {
    const asset = lease.value;
    return {
      kind: "raster",
      canvas: asset.canvas,
      bounds: asset.bounds,
      pixelWidth: asset.pixelWidth,
      pixelHeight: asset.pixelHeight,
      colorSpace: "srgb",
      alpha: "straight",
      release: () => lease.release(),
    };
  }

  #createAsset(bounds: Bounds): { canvas: NativeCanvas; ctx: Native2DContext } {
    const limit =
      this.#options.maxTextureDimension ?? DEFAULT_MAX_TEXTURE_DIMENSION;
    if (bounds.width > limit || bounds.height > limit)
      throw createCompatError(
        ERROR_CODES.RESOURCE_LIMIT,
        `raster asset ${bounds.width}x${bounds.height} exceeds ${limit}`,
      );
    const canvas = this.#options.createCanvas(bounds.width, bounds.height);
    return { canvas, ctx: context2d(canvas) };
  }

  #renderPath(
    path: PathSnapshot,
    state: DrawState,
    mode: "fill" | "stroke",
  ): Asset {
    const geometry = pathGeometryBounds(path);
    if (!geometry) return emptyAsset(this.#options.createCanvas);
    const margin =
      mode === "stroke"
        ? scaleBound(state.transform) * state.lineWidth * (MITER_LIMIT + 0.5) + 2
        : 1;
    const bounds = alignOutset(geometry, margin, this.#scene());
    if (!bounds) return emptyAsset(this.#options.createCanvas);
    const { canvas, ctx } = this.#createAsset(bounds);
    try {
      // Paint at the exact scene position with the recorded transforms
      // verbatim, then crop the coverage window; translating the geometry into
      // a tight canvas would rasterize curves differently than the native scene.
      const scene = this.#scene();
      const stage = this.#stageContext(scene.width, scene.height);
      replayPath(stage.ctx, path, 0, 0);
      const lastTransform = path.commands[path.commands.length - 1]?.transform;
      if (!lastTransform || !lastTransform.every((value, index) => value === state.transform[index]))
        stage.ctx.setTransform(...state.transform);
      if (mode === "stroke") {
        // Stroke-time CTM scales the width and evaluates the stroke paint.
        // Reinstalling an identical CTM would rebase native path geometry.
        stage.ctx.lineWidth = state.lineWidth;
        stage.ctx.lineCap = state.lineCap;
        stage.ctx.lineJoin = state.lineJoin;
        applyPaint(stage.ctx, state.stroke, "stroke", this.#patternSource);
        stage.ctx.stroke();
      } else {
        applyPaint(stage.ctx, state.fill, "fill", this.#patternSource);
        stage.ctx.fill();
      }
      ctx.putImageData(
        stage.ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height),
        0,
        0,
      );
    } catch (error) {
      destroyCanvas(canvas);
      throw error;
    }
    return {
      canvas,
      bounds,
      pixelWidth: bounds.width,
      pixelHeight: bounds.height,
    };
  }

  #renderText(
    text: string,
    x: number,
    y: number,
    state: DrawState,
    mode: "fill" | "stroke",
  ): Asset {
    const measure = this.#measureContext();
    measure.font = state.font;
    measure.textAlign = state.textAlign;
    measure.textBaseline = state.textBaseline;
    const metrics = measure.measureText(text);
    let left: number, right: number, ascent: number, descent: number;
    if (
      typeof metrics.actualBoundingBoxLeft === "number" &&
      typeof metrics.actualBoundingBoxRight === "number" &&
      typeof metrics.actualBoundingBoxAscent === "number" &&
      typeof metrics.actualBoundingBoxDescent === "number"
    ) {
      left = metrics.actualBoundingBoxLeft;
      right = metrics.actualBoundingBoxRight;
      ascent = metrics.actualBoundingBoxAscent;
      descent = metrics.actualBoundingBoxDescent;
    } else {
      const size = /(\d+(?:\.\d+)?)px/.exec(state.font);
      const em = size ? Number(size[1]) : 16;
      const width = metrics.width;
      left = state.textAlign === "center" ? width / 2 : state.textAlign === "right" ? width : 0;
      right = width - left;
      ascent = 2 * em;
      descent = 2 * em;
    }
    const corners = [
      [x - left, y - ascent],
      [x + right, y - ascent],
      [x + right, y + descent],
      [x - left, y + descent],
    ] as const;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [cx, cy] of corners) {
      const [dx, dy] = applyPoint(state.transform, cx, cy);
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
      minX = Math.min(minX, dx); maxX = Math.max(maxX, dx);
      minY = Math.min(minY, dy); maxY = Math.max(maxY, dy);
    }
    if (minX > maxX || minY > maxY) return emptyAsset(this.#options.createCanvas);
    const margin =
      mode === "stroke"
        ? scaleBound(state.transform) * state.lineWidth * (MITER_LIMIT + 0.5) + 2
        : 2;
    const bounds = alignOutset(
      { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      margin,
      this.#scene(),
    );
    if (!bounds) return emptyAsset(this.#options.createCanvas);
    const { canvas, ctx } = this.#createAsset(bounds);
    try {
      const paint = mode === "fill" ? state.fill : state.stroke;
      if (paint.kind === "solid") {
        // Solid text is translation-invariant (byte-exact across scene
        // positions), so it keeps this tight asset canvas with the draw-time
        // transform shifted into asset space.
        const shifted = offsetMatrix(state.transform, bounds.x, bounds.y);
        ctx.setTransform(...shifted);
        ctx.font = state.font;
        ctx.textAlign = state.textAlign;
        ctx.textBaseline = state.textBaseline;
        if (mode === "stroke") {
          ctx.lineWidth = state.lineWidth;
          ctx.lineCap = state.lineCap;
          ctx.lineJoin = state.lineJoin;
        }
        applyPaint(ctx, paint, mode, this.#patternSource);
        if (mode === "fill") ctx.fillText(text, x, y);
        else ctx.strokeText(text, x, y);
      } else {
        // Same scene-position rule as #renderPath: native gradient/pattern
        // quantization depends on the absolute device coordinates the paint
        // is evaluated at, so a tight asset canvas with a shifted CTM cannot
        // byte-match the scene-origin render (Chromium probe, PR #38 review).
        // Paint on the scene-origin stage under the draw-time transform and
        // crop the coverage window.
        const stage = this.#stageContext(
          bounds.x + bounds.width,
          bounds.y + bounds.height,
        );
        stage.ctx.setTransform(...state.transform);
        stage.ctx.font = state.font;
        stage.ctx.textAlign = state.textAlign;
        stage.ctx.textBaseline = state.textBaseline;
        if (mode === "stroke") {
          stage.ctx.lineWidth = state.lineWidth;
          stage.ctx.lineCap = state.lineCap;
          stage.ctx.lineJoin = state.lineJoin;
        }
        applyPaint(stage.ctx, paint, mode, this.#patternSource);
        if (mode === "fill") stage.ctx.fillText(text, x, y);
        else stage.ctx.strokeText(text, x, y);
        ctx.putImageData(
          stage.ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height),
          0,
          0,
        );
      }
    } catch (error) {
      destroyCanvas(canvas);
      throw error;
    }
    return {
      canvas,
      bounds,
      pixelWidth: bounds.width,
      pixelHeight: bounds.height,
    };
  }

  #renderClip(
    path: PathSnapshot,
    rule: "nonzero" | "evenodd",
    bounds: Bounds,
  ): Asset {
    const aligned = alignOutset(bounds, 0, this.#scene());
    if (!aligned) return emptyAsset(this.#options.createCanvas);
    const { canvas, ctx } = this.#createAsset(aligned);
    try {
      // Same scene-position rule as #renderPath: the mask must match the
      // native clip coverage byte for byte, so curves are never re-rasterized
      // at a translated origin.
      const stage = this.#stageContext(
        aligned.x + aligned.width,
        aligned.y + aligned.height,
      );
      replayPath(stage.ctx, path, 0, 0);
      stage.ctx.setTransform(1, 0, 0, 1, 0, 0);
      stage.ctx.fillStyle = "#ffffff";
      stage.ctx.fill(rule);
      ctx.putImageData(
        stage.ctx.getImageData(aligned.x, aligned.y, aligned.width, aligned.height),
        0,
        0,
      );
    } catch (error) {
      destroyCanvas(canvas);
      throw error;
    }
    return {
      canvas,
      bounds: aligned,
      pixelWidth: aligned.width,
      pixelHeight: aligned.height,
    };
  }
}

export function createRasterizer(options: RasterizerOptions): Rasterizer {
  return new NativeRasterizer(options);
}
