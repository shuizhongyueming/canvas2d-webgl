import type { NativeCanvas } from "../api.js";
import type {
  Bounds,
  DrawState,
  Paint,
  PathSnapshot,
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
  #measure: Native2DContext | null = null;

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
      mode,
      text,
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
    this.#measure = null;
  }

  #assertLive(): void {
    if (this.#disposed)
      throw createCompatError(ERROR_CODES.DISPOSED, "rasterizer is disposed");
  }

  #measureContext(): Native2DContext {
    if (!this.#measure)
      this.#measure = context2d(this.#options.createCanvas(1, 1));
    return this.#measure;
  }

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
    replayPath(ctx, path, bounds.x, bounds.y);
    if (mode === "stroke") {
      const strokeTransform = offsetMatrix(state.transform, bounds.x, bounds.y);
      ctx.setTransform(...strokeTransform);
      ctx.lineWidth = state.lineWidth;
      ctx.lineCap = state.lineCap;
      ctx.lineJoin = state.lineJoin;
      applyPaint(ctx, state.stroke, "stroke", bounds.x, bounds.y, state.transform);
      ctx.stroke();
    } else {
      // Patterns paint in the draw-time space; solids and gradients are
      // transform-independent because gradient endpoints are pre-mapped.
      if (state.fill.kind === "repeat-pattern")
        ctx.setTransform(...offsetMatrix(state.transform, bounds.x, bounds.y));
      else ctx.setTransform(1, 0, 0, 1, 0, 0);
      applyPaint(ctx, state.fill, "fill", bounds.x, bounds.y, state.transform);
      ctx.fill();
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
    const shifted = offsetMatrix(state.transform, bounds.x, bounds.y);
    ctx.setTransform(...shifted);
    ctx.font = state.font;
    ctx.textAlign = state.textAlign;
    ctx.textBaseline = state.textBaseline;
    const paint = mode === "fill" ? state.fill : state.stroke;
    if (mode === "stroke") {
      ctx.lineWidth = state.lineWidth;
      ctx.lineCap = state.lineCap;
      ctx.lineJoin = state.lineJoin;
    }
    applyPaint(ctx, paint, mode, bounds.x, bounds.y, state.transform);
    if (mode === "fill") ctx.fillText(text, x, y);
    else ctx.strokeText(text, x, y);
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
    replayPath(ctx, path, aligned.x, aligned.y);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fill(rule);
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
