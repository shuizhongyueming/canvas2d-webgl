import type { ImageSource, NativeCanvas } from "../api.js";
import type { PatternBitmap, RasterSource } from "../internal/contracts.js";
import { createCompatError, ERROR_CODES } from "../contracts/errors.js";

export type TextureSource = RasterSource | ImageSource | PatternBitmap;

export interface SourcePixels {
  readonly width: number;
  readonly height: number;
  /** Present for DOM-backed sources; absent for owned typed-array bitmaps. */
  readonly element?: NativeCanvas | HTMLImageElement;
  /** Present for owned typed-array bitmaps (straight sRGB, like RasterSource). */
  readonly data?: Uint8ClampedArray;
}

/** Captured pattern bitmaps are the only sources carrying their own pixels. */
export function isPatternBitmap(source: object): source is PatternBitmap {
  return (
    typeof source === "object" &&
    source !== null &&
    (source as PatternBitmap).data instanceof Uint8ClampedArray
  );
}

export function isRasterSource(source: object): source is RasterSource {
  return (
    typeof source === "object" &&
    source !== null &&
    (source as RasterSource).kind === "raster"
  );
}

/** Raster sources carry explicit pixel sizes; raw sources expose their own. */
export function sourcePixels(source: TextureSource): SourcePixels {
  if (isRasterSource(source))
    return {
      width: source.pixelWidth,
      height: source.pixelHeight,
      element: source.canvas,
    };
  if (isPatternBitmap(source))
    return {
      width: source.width,
      height: source.height,
      data: source.data,
    };
  if (
    typeof HTMLImageElement !== "undefined" &&
    source instanceof HTMLImageElement
  )
    return {
      width: source.naturalWidth,
      height: source.naturalHeight,
      element: source,
    };
  const canvas = source as NativeCanvas;
  return { width: canvas.width, height: canvas.height, element: canvas };
}

/**
 * Upload a native source exactly once per call: straight alpha is premultiplied
 * by the WebGL unpack convention so scene textures stay premultiplied without
 * a second multiply in the shader. Sources are never flipped; UV conventions
 * are handled by the drawing entry points. Captured pattern bitmaps upload
 * through the typed-array overload under the same unpack convention.
 */
export function uploadSourceTexture(
  gl: WebGLRenderingContext,
  source: TextureSource,
  maxTextureSize: number,
): WebGLTexture {
  const { width, height, element, data } = sourcePixels(source);
  if (!(width >= 1) || !(height >= 1))
    throw createCompatError(
      ERROR_CODES.INITIALIZATION,
      "source has no pixels to upload",
    );
  if (width > maxTextureSize || height > maxTextureSize)
    throw createCompatError(
      ERROR_CODES.RESOURCE_LIMIT,
      `source ${width}x${height} exceeds MAX_TEXTURE_SIZE ${maxTextureSize}`,
    );
  const texture = gl.createTexture();
  if (!texture)
    throw createCompatError(ERROR_CODES.INITIALIZATION, "texture creation failed");
  try {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (data)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data,
      );
    else
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        element as TexImageSource,
      );
    const error = gl.getError();
    if (error !== gl.NO_ERROR)
      throw createCompatError(
        ERROR_CODES.INITIALIZATION,
        `source upload failed: GL error 0x${error.toString(16)}`,
      );
  } catch (failure) {
    gl.deleteTexture(texture);
    throw failure;
  }
  return texture;
}
