import { createCompatError, ERROR_CODES } from "../contracts/errors.js";
import { validateSceneSize } from "./context.js";

/**
 * The persistent scene: one RGBA texture with a stencil attachment, cleared to
 * transparent black at creation. Canvas content lives here across frames; the
 * default framebuffer only ever receives a blit at a commit point.
 */
export interface SceneFramebuffer {
  readonly framebuffer: WebGLFramebuffer;
  readonly texture: WebGLTexture;
  readonly stencil: WebGLRenderbuffer;
  readonly width: number;
  readonly height: number;
}

export function createSceneFramebuffer(
  gl: WebGLRenderingContext,
  width: number,
  height: number,
  maxTextureSize: number,
): SceneFramebuffer {
  validateSceneSize(width, height, maxTextureSize);
  const texture = gl.createTexture();
  const stencil = gl.createRenderbuffer();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !stencil || !framebuffer) {
    if (texture) gl.deleteTexture(texture);
    if (stencil) gl.deleteRenderbuffer(stencil);
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    throw createCompatError(
      ERROR_CODES.INITIALIZATION,
      "scene framebuffer allocation failed",
    );
  }
  try {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.bindRenderbuffer(gl.RENDERBUFFER, stencil);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.STENCIL_ATTACHMENT,
      gl.RENDERBUFFER,
      stencil,
    );
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE)
      throw createCompatError(
        ERROR_CODES.CAPABILITY,
        `scene framebuffer with stencil is incomplete: 0x${status.toString(16)}`,
      );
    gl.clearColor(0, 0, 0, 0);
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    const error = gl.getError();
    if (error !== gl.NO_ERROR)
      throw createCompatError(
        ERROR_CODES.INITIALIZATION,
        `scene framebuffer setup failed: GL error 0x${error.toString(16)}`,
      );
  } catch (failure) {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteRenderbuffer(stencil);
    gl.deleteTexture(texture);
    throw failure;
  }
  return { framebuffer, texture, stencil, width, height };
}

export function destroySceneFramebuffer(
  gl: WebGLRenderingContext,
  scene: SceneFramebuffer | null,
): void {
  if (!scene) return;
  gl.deleteFramebuffer(scene.framebuffer);
  gl.deleteRenderbuffer(scene.stencil);
  gl.deleteTexture(scene.texture);
}
