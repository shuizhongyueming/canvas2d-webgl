import { createCompatError, ERROR_CODES } from "../contracts/errors.js";
import type { NativeCanvas } from "../api.js";
import type { RasterSource } from "../internal/contracts.js";
import { uploadSourceTexture } from "./upload.js";

interface Entry {
  readonly texture: WebGLTexture;
  readonly pixels: number;
  readonly width: number;
  readonly height: number;
}

export interface CachedTexture {
  readonly texture: WebGLTexture;
  readonly width: number;
  readonly height: number;
  readonly clamp: readonly [number, number, number, number];
  readonly retained: boolean;
  readonly uvs: number[];
}

/** Immutable internal raster assets only; external sources never enter. */
export class TextureCache {
  readonly #entries = new Map<NativeCanvas, Entry>();
  #pixels = 0;

  constructor(
    private readonly gl: WebGLRenderingContext,
    private readonly limit: number,
    private readonly maxEntries = 64,
    private readonly maxPixels = 16 * 1024 * 1024,
  ) {}

  get size(): number {
    return this.#entries.size;
  }

  acquire(source: RasterSource): CachedTexture {
    const width = source.pixelWidth,
      height = source.pixelHeight;
    const key = source.canvas;
    const existing = this.#entries.get(key);
    if (existing) {
      const error = this.gl.getError();
      if (error !== this.gl.NO_ERROR)
        throw createCompatError(
          ERROR_CODES.INITIALIZATION,
          `cached source upload failed: GL error 0x${error.toString(16)}`,
        );
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, existing.texture);
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_MIN_FILTER,
        this.gl.NEAREST,
      );
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_MAG_FILTER,
        this.gl.NEAREST,
      );
      this.#entries.delete(key);
      this.#entries.set(key, existing);
      const result: CachedTexture = {
        texture: existing.texture,
        width: existing.width,
        height: existing.height,
        clamp: [0, 0, 1, 1],
        retained: true,
        uvs: [0, 0, 1, 0, 0, 1, 1, 1],
      };
      return result;
    }
    if (width * height > this.maxPixels) return this.uncached(source);
    const pixels = width * height;
    const texture = uploadSourceTexture(this.gl, source, this.limit);
    const entry = { texture, pixels, width, height };
    this.#entries.set(key, entry);
    this.#pixels += pixels;
    this.evict();
    if (this.#entries.get(key) !== entry) {
      this.gl.deleteTexture(texture);
      return this.uncached(source);
    }
    return {
      texture,
      width,
      height,
      clamp: [0, 0, 1, 1],
      retained: true,
      uvs: [0, 0, 1, 0, 0, 1, 1, 1],
    };
  }

  private uncached(source: RasterSource): CachedTexture {
    const texture = uploadSourceTexture(this.gl, source, this.limit);
    const error = this.gl.getError();
    if (error !== this.gl.NO_ERROR) {
      this.gl.deleteTexture(texture);
      throw createCompatError(
        ERROR_CODES.INITIALIZATION,
        `source upload failed: GL error 0x${error.toString(16)}`,
      );
    }
    return {
      texture,
      width: source.pixelWidth,
      height: source.pixelHeight,
      clamp: [0, 0, 1, 1],
      retained: false,
      uvs: [0, 0, 1, 0, 0, 1, 1, 1],
    };
  }

  private evict(): void {
    for (const [key, entry] of this.#entries) {
      if (
        this.#entries.size <= this.maxEntries &&
        this.#pixels <= this.maxPixels
      )
        return;
      this.#entries.delete(key);
      this.#pixels -= entry.pixels;
      this.gl.deleteTexture(entry.texture);
    }
  }

  clear(): void {
    for (const entry of this.#entries.values())
      this.gl.deleteTexture(entry.texture);
    this.#entries.clear();
    this.#pixels = 0;
  }
}
