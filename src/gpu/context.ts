import type { TargetCanvas } from "../api.js";
import { createCompatError, ERROR_CODES } from "../contracts/errors.js";

/** The approved GL options; every device validates the actual attributes. */
export const APPROVED_CONTEXT_ATTRIBUTES = Object.freeze({
  alpha: true,
  premultipliedAlpha: true,
  stencil: true,
  preserveDrawingBuffer: false,
});

export interface ContextCapabilities {
  readonly maxTextureSize: number;
  readonly stencilBits: number;
}

/**
 * Bind the target canvas to WebGL 1 with the approved attributes. A target
 * already bound to WebGL keeps its existing context, so the actual attributes
 * are validated separately; a target that cannot provide a WebGL 1 context
 * reports webgl-unavailable.
 */
export function acquireWebGLContext(
  target: TargetCanvas,
): WebGLRenderingContext {
  const gl = target.getContext("webgl", {
    ...APPROVED_CONTEXT_ATTRIBUTES,
  }) as WebGLRenderingContext | null;
  if (!gl)
    throw createCompatError(
      ERROR_CODES.WEBGL_UNAVAILABLE,
      "WebGL 1 context could not be created",
    );
  return gl;
}

/** Validate the real attributes and required capabilities of a live context. */
export function validateContext(
  gl: WebGLRenderingContext,
): ContextCapabilities {
  const attributes = gl.getContextAttributes?.();
  if (!attributes)
    throw createCompatError(
      ERROR_CODES.CONTEXT_ATTRIBUTES,
      "actual context attributes are unreadable",
    );
  for (const [name, expected] of Object.entries(APPROVED_CONTEXT_ATTRIBUTES)) {
    const actual = attributes[name as keyof WebGLContextAttributes];
    if (actual !== expected)
      throw createCompatError(
        ERROR_CODES.CONTEXT_ATTRIBUTES,
        `${name}: expected ${String(expected)}, got ${String(actual)}`,
      );
  }
  const stencilBits = gl.getParameter(gl.STENCIL_BITS) as number;
  if (!(stencilBits > 0))
    throw createCompatError(
      ERROR_CODES.CAPABILITY,
      "stencil buffer is required but missing",
    );
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  if (!(maxTextureSize > 0))
    throw createCompatError(
      ERROR_CODES.CAPABILITY,
      "MAX_TEXTURE_SIZE is unavailable",
    );
  return { maxTextureSize, stencilBits };
}

/** Sizes are positive integers bounded by the platform texture limit. */
export function validateSceneSize(
  width: number,
  height: number,
  maxTextureSize: number,
): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  )
    throw createCompatError(
      ERROR_CODES.SIZE_UNSUPPORTED,
      `scene size must be positive integers, got ${width}x${height}`,
    );
  if (width > maxTextureSize || height > maxTextureSize)
    throw createCompatError(
      ERROR_CODES.RESOURCE_LIMIT,
      `scene ${width}x${height} exceeds MAX_TEXTURE_SIZE ${maxTextureSize}`,
    );
}
