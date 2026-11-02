import { createCompatError, ERROR_CODES } from "../contracts/errors.js";
import { isRasterSource, sourcePixels, type TextureSource } from "./upload.js";

interface Slot {
  texture: WebGLTexture;
  width: number;
  height: number;
}

export interface StreamedTexture extends Slot {
  readonly clamp: readonly [number, number, number, number];
}

/** Two bounded upload buffers, not a cache of external source content. */
export class TextureStream {
  private nearest: Slot | null = null;
  private linear: Slot | null = null;
  private dirty = false;
  private failure: Error | null = null;

  constructor(
    private readonly gl: WebGLRenderingContext,
    private readonly limit: number,
    private readonly rounded = true,
  ) {}

  get count(): number {
    return Number(!!this.nearest) + Number(!!this.linear);
  }

  private extent(size: number): number {
    return this.rounded
      ? Math.min(this.limit, 2 ** Math.ceil(Math.log2(size)))
      : size;
  }

  upload(source: TextureSource): StreamedTexture {
    if (this.failure) throw this.failure;
    const { width, height, element } = sourcePixels(source);
    if (!(width >= 1 && height >= 1) || !element)
      throw createCompatError(
        ERROR_CODES.INITIALIZATION,
        "source has no pixels to upload",
      );
    if (width > this.limit || height > this.limit)
      throw createCompatError(
        ERROR_CODES.RESOURCE_LIMIT,
        `source ${width}x${height} exceeds MAX_TEXTURE_SIZE ${this.limit}`,
      );
    const gl = this.gl;
    const nearest = isRasterSource(source);
    let slot = nearest ? this.nearest : this.linear;
    gl.activeTexture(gl.TEXTURE0);
    if (!slot || slot.width < width || slot.height < height) {
      const texture = gl.createTexture();
      if (!texture)
        throw createCompatError(
          ERROR_CODES.INITIALIZATION,
          "upload buffer allocation failed",
        );
      const next = {
        texture,
        width: this.extent(Math.max(width, slot?.width ?? 1)),
        height: this.extent(Math.max(height, slot?.height ?? 1)),
      };
      // Do not combine unrelated narrow/tall peaks into an enormous buffer.
      if (next.width * next.height > 16 * 1024 * 1024) {
        next.width = width;
        next.height = height;
      }
      try {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        const filter = nearest ? gl.NEAREST : gl.LINEAR;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          next.width,
          next.height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null,
        );
        // Allocation failures remain synchronous, before changing the scene.
        this.checkError("upload buffer allocation");
      } catch (failure) {
        gl.deleteTexture(texture);
        throw failure;
      }
      if (slot) gl.deleteTexture(slot.texture);
      slot = next;
      if (nearest) this.nearest = slot;
      else this.linear = slot;
    }
    gl.bindTexture(gl.TEXTURE_2D, slot.texture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      nearest ? gl.NEAREST : gl.LINEAR,
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MAG_FILTER,
      nearest ? gl.NEAREST : gl.LINEAR,
    );
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    // Sampling happens on every call. WebGL preserves draw/update ordering;
    // later source mutations cannot change pixels from an earlier draw.
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      element as TexImageSource,
    );
    this.dirty = true;
    return {
      ...slot,
      clamp: [
        0.5 / slot.width,
        0.5 / slot.height,
        (width - 0.5) / slot.width,
        (height - 0.5) / slot.height,
      ],
    };
  }

  private checkError(stage: string): void {
    if (this.failure) throw this.failure;
    const error = this.gl.getError();
    if (error !== this.gl.NO_ERROR && !this.gl.isContextLost()) {
      this.failure = createCompatError(
        ERROR_CODES.INITIALIZATION,
        `${stage} failed: GL error 0x${error.toString(16)}`,
      );
      throw this.failure;
    }
  }

  /** Bounded updates use one GL status query per commit/readback. */
  check(): void {
    if (this.failure) throw this.failure;
    if (!this.dirty) return;
    this.dirty = false;
    this.checkError("source upload");
  }

  clear(): void {
    if (this.nearest) this.gl.deleteTexture(this.nearest.texture);
    if (this.linear) this.gl.deleteTexture(this.linear.texture);
    this.nearest = this.linear = null;
    this.dirty = false;
    this.failure = null;
  }
}
