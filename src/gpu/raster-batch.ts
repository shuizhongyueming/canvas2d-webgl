import type { NativeCanvas } from "../api.js";
import type {
  Bounds,
  DrawOperation,
  RasterSource,
} from "../internal/contracts.js";
import type { OffscreenFactory } from "../canvas/offscreen.js";
import {
  context2d,
  destroyCanvas,
  type Native2DContext,
} from "../raster/native.js";
import { sourcePixels } from "./upload.js";

interface Tile {
  readonly operation: DrawOperation;
  readonly region?: Bounds;
  readonly sampling?: Bounds;
  readonly linear?: boolean;
}

/** Source snapshots only. The scene is still composited by WebGL in call order. */
export class RasterBatch {
  private pixels: Uint8ClampedArray<ArrayBuffer> | null = null;
  private canvas: NativeCanvas | null = null;
  private context: Native2DContext | null = null;
  private probe: { canvas: NativeCanvas; context: Native2DContext } | null =
    null;
  private tiles: Tile[] = [];
  private x = 0;
  private y = 0;
  private rowHeight = 0;
  constructor(
    readonly size: number,
    private readonly createCanvas?: OffscreenFactory,
  ) {}

  get count(): number {
    return this.tiles.length;
  }

  private stage(
    width: number,
    height: number,
    readback: boolean,
  ): { canvas: NativeCanvas; context: Native2DContext } {
    const canvas = this.createCanvas!(width, height);
    try {
      return {
        canvas,
        context: context2d(canvas, { willReadFrequently: readback }),
      };
    } catch (failure) {
      destroyCanvas(canvas);
      throw failure;
    }
  }

  private reserve(width: number, height: number): Bounds | null {
    if (width > this.size || height > this.size) return null;
    if (this.x + width > this.size) {
      this.y += this.rowHeight;
      this.x = this.rowHeight = 0;
    }
    if (this.y + height > this.size) return null;
    const region = { x: this.x, y: this.y, width, height };
    this.x += width;
    this.rowHeight = Math.max(this.rowHeight, height);
    return region;
  }

  append(operation: DrawOperation, image: ImageData): boolean {
    const region = this.reserve(image.width, image.height);
    if (!region) return false;
    if (this.context) this.context.putImageData(image, region.x, region.y);
    else {
      this.pixels ??= new Uint8ClampedArray(this.size * this.size * 4);
      for (let y = 0; y < image.height; y += 1) {
        const start = y * image.width * 4;
        this.pixels.set(
          image.data.subarray(start, start + image.width * 4),
          ((region.y + y) * this.size + region.x) * 4,
        );
      }
    }
    this.tiles.push({ operation, region, sampling: region });
    return true;
  }

  appendOperation(operation: DrawOperation): void {
    this.tiles.push({ operation });
  }

  appendImage(operation: DrawOperation): boolean {
    if (!this.createCanvas || operation.source.kind !== "image") return false;
    const source = operation.source;
    const { width, height } = sourcePixels(source.image);
    // One neighbor on each side preserves full-source bilinear filtering.
    const x = Math.max(0, Math.floor(source.sourceRect.x) - 1);
    const y = Math.max(0, Math.floor(source.sourceRect.y) - 1);
    const right = Math.min(
      width,
      Math.ceil(source.sourceRect.x + source.sourceRect.width) + 1,
    );
    const bottom = Math.min(
      height,
      Math.ceil(source.sourceRect.y + source.sourceRect.height) + 1,
    );
    if (right - x > this.size || bottom - y > this.size) return false;
    // Test origin cleanliness synchronously before touching the shared atlas.
    // Reading one pixel is enough: taint is a property of the whole source.
    if (!this.probe) {
      this.probe = this.stage(1, 1, false);
    }
    try {
      this.probe.context.drawImage(
        source.image as CanvasImageSource,
        0,
        0,
        1,
        1,
        0,
        0,
        1,
        1,
      );
      // Origin cleanliness is checked even for an out-of-bounds read. The
      // returned transparent pixel needs no GPU readback or synchronization.
      this.probe.context.getImageData(1, 1, 1, 1);
    } catch (error) {
      this.probe.canvas.width = 1;
      throw error;
    }
    const region = this.reserve(right - x, bottom - y);
    if (!region) return false;
    if (!this.context) {
      const { canvas, context } = this.stage(this.size, this.size, false);
      try {
        if (this.pixels)
          context.putImageData(
            new ImageData(this.pixels, this.size, this.size),
            0,
            0,
          );
      } catch (failure) {
        destroyCanvas(canvas);
        throw failure;
      }
      this.canvas = canvas;
      this.context = context;
      this.pixels = null;
    }
    this.context.clearRect(region.x, region.y, region.width, region.height);
    this.context.drawImage(
      source.image as CanvasImageSource,
      x,
      y,
      region.width,
      region.height,
      region.x,
      region.y,
      region.width,
      region.height,
    );
    this.tiles.push({
      operation,
      region,
      linear: true,
      sampling: {
        x: region.x + source.sourceRect.x - x,
        y: region.y + source.sourceRect.y - y,
        width: source.sourceRect.width,
        height: source.sourceRect.height,
      },
    });
    return true;
  }

  take(): { source: RasterSource | null; tiles: Tile[] } | null {
    if (!this.tiles.length) return null;
    const height = this.y + this.rowHeight;
    const hasPixels = this.tiles.some((tile) => tile.region !== undefined);
    const imageData =
      !hasPixels || this.context
        ? null
        : new ImageData(
            this.pixels!.subarray(0, this.size * height * 4),
            this.size,
            height,
          );
    const canvas = this.canvas;
    const tiles = this.tiles;
    this.clear();
    return {
      source: hasPixels
        ? {
            kind: "raster",
            get canvas(): NativeCanvas {
              if (canvas) return canvas;
              throw Error("batch must upload captured pixels");
            },
            imageData: imageData ?? undefined,
            bounds: {
              x: 0,
              y: 0,
              width: this.size,
              height: canvas ? this.size : height,
            },
            pixelWidth: this.size,
            pixelHeight: canvas ? this.size : height,
            colorSpace: "srgb",
            alpha: "straight",
            release() {},
          }
        : null,
      tiles,
    };
  }

  clear(): void {
    this.tiles = [];
    this.x = this.y = this.rowHeight = 0;
  }

  dispose(): void {
    this.clear();
    this.pixels = null;
    if (this.canvas) destroyCanvas(this.canvas);
    if (this.probe) destroyCanvas(this.probe.canvas);
    this.canvas = this.context = this.probe = null;
  }
}
