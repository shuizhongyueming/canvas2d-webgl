import type { CompositeMode, ImageSource, TargetCanvas } from "../api.js";
import type {
  Bounds,
  DrawOperation,
  GPUDevice,
  Matrix,
  Presenter,
  RasterSource,
  ResourceHandle,
  ResourceLease,
  ResourceOwner,
} from "../internal/contracts.js";
import {
  createCompatError,
  ERROR_CODES,
  rollbackInitialization,
} from "../contracts/errors.js";
import { createResourceOwner } from "../resources/owner.js";
import {
  createLeaseRegistry,
  type LeaseRegistry,
} from "../resources/leases.js";
import {
  createPresenter,
  type ScheduledPresenter,
} from "../scheduling/presenter.js";
import {
  acquireWebGLContext,
  validateContext,
  validateSceneSize,
} from "./context.js";
import { compileProgram } from "./program.js";
import {
  createSceneFramebuffer,
  destroySceneFramebuffer,
  type SceneFramebuffer,
} from "./scene.js";
import { isRasterSource, sourcePixels, uploadSourceTexture } from "./upload.js";
import { createTestHooks, type SceneTestHooks } from "./hooks.js";

export interface SceneRendererOptions {
  /** Distinguishes an incompatible target binding from missing WebGL 1. */
  createProbeCanvas?: () => TargetCanvas;
  /** Test-only fault injection: fail right after the named creation step. */
  failAfter?: "context" | "attributes" | "programs" | "scene";
}

export interface SceneRenderer {
  readonly device: GPUDevice;
  readonly presenter: Presenter;
  readonly resources: ResourceOwner;
  readonly hooks: SceneTestHooks;
}

const SOLID_VERTEX = `
attribute vec2 a_position;
uniform vec2 u_resolution;
void main() {
  vec2 clip = vec2(
    a_position.x / u_resolution.x * 2.0 - 1.0,
    1.0 - a_position.y / u_resolution.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;
const SOLID_FRAGMENT = `
precision mediump float;
uniform vec4 u_color;
void main() {
  gl_FragColor = u_color;
}
`;
const TEXTURED_VERTEX = `
attribute vec2 a_position;
attribute vec2 a_uv;
uniform vec2 u_resolution;
varying vec2 v_uv;
void main() {
  vec2 clip = vec2(
    a_position.x / u_resolution.x * 2.0 - 1.0,
    1.0 - a_position.y / u_resolution.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_uv = a_uv;
}
`;
const TEXTURED_FRAGMENT = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_alpha;
void main() {
  vec4 color = texture2D(u_texture, v_uv);
  gl_FragColor = vec4(color.rgb * u_alpha, color.a * u_alpha);
}
`;

const TRANSPARENT = [0, 0, 0, 0] as const;

interface SolidProgram {
  readonly program: WebGLProgram;
  readonly aPosition: number;
  readonly uResolution: WebGLUniformLocation;
  readonly uColor: WebGLUniformLocation;
}
interface TexturedProgram {
  readonly program: WebGLProgram;
  readonly aPosition: number;
  readonly aUv: number;
  readonly uResolution: WebGLUniformLocation;
  readonly uTexture: WebGLUniformLocation;
  readonly uAlpha: WebGLUniformLocation;
}

function makeSolidProgram(gl: WebGLRenderingContext): SolidProgram {
  const program = compileProgram(gl, SOLID_VERTEX, SOLID_FRAGMENT);
  try {
    const aPosition = gl.getAttribLocation(program, "a_position");
    const uResolution = gl.getUniformLocation(program, "u_resolution");
    const uColor = gl.getUniformLocation(program, "u_color");
    if (aPosition < 0 || !uResolution || !uColor)
      throw createCompatError(
        ERROR_CODES.INITIALIZATION,
        "solid program interface is incomplete",
      );
    return { program, aPosition, uResolution, uColor };
  } catch (failure) {
    gl.deleteProgram(program);
    throw failure;
  }
}

function makeTexturedProgram(gl: WebGLRenderingContext): TexturedProgram {
  const program = compileProgram(gl, TEXTURED_VERTEX, TEXTURED_FRAGMENT);
  try {
    const aPosition = gl.getAttribLocation(program, "a_position");
    const aUv = gl.getAttribLocation(program, "a_uv");
    const uResolution = gl.getUniformLocation(program, "u_resolution");
    const uTexture = gl.getUniformLocation(program, "u_texture");
    const uAlpha = gl.getUniformLocation(program, "u_alpha");
    if (aPosition < 0 || aUv < 0 || !uResolution || !uTexture || !uAlpha)
      throw createCompatError(
        ERROR_CODES.INITIALIZATION,
        "textured program interface is incomplete",
      );
    return { program, aPosition, aUv, uResolution, uTexture, uAlpha };
  } catch (failure) {
    gl.deleteProgram(program);
    throw failure;
  }
}

/** Device pixels, top-left origin; the single place geometry meets GL. */
function rectCorners(bounds: Bounds, transform: Matrix): number[] {
  const [a, b, c, d, e, f] = transform;
  const point = (x: number, y: number) => [
    a * x + c * y + e,
    b * x + d * y + f,
  ];
  const { x, y, width, height } = bounds;
  return [
    ...point(x, y),
    ...point(x + width, y),
    ...point(x, y + height),
    ...point(x + width, y + height),
  ];
}

type ImageDrawSource = Extract<DrawOperation["source"], { kind: "image" }>;

class SceneDevice implements GPUDevice {
  private readonly gl: WebGLRenderingContext;
  private readonly target: TargetCanvas;
  private readonly maxTextureSize: number;
  private readonly registry: LeaseRegistry<WebGLTexture>;
  private readonly presenterQueue: ScheduledPresenter;
  private readonly owner: ResourceOwner;
  private readonly blendFactors: Record<CompositeMode, [number, number]>;
  private scene: SceneFramebuffer | null = null;
  private solid: SolidProgram | null = null;
  private textured: TexturedProgram | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private uvBuffer: WebGLBuffer | null = null;
  private presentCount = 0;
  generation = 0;
  status: "active" | "lost" | "disposed" = "active";
  width: number;
  height: number;

  constructor(
    target: TargetCanvas,
    gl: WebGLRenderingContext,
    maxTextureSize: number,
    owner: ResourceOwner,
  ) {
    this.target = target;
    this.gl = gl;
    this.maxTextureSize = maxTextureSize;
    this.owner = owner;
    this.width = target.width;
    this.height = target.height;
    this.registry = createLeaseRegistry<WebGLTexture>((texture) =>
      gl.deleteTexture(texture),
    );
    this.presenterQueue = createPresenter({
      currentGeneration: () => this.generation,
      present: (generation) => this.present(generation),
    });
    this.blendFactors = {
      "source-over": [gl.ONE, gl.ONE_MINUS_SRC_ALPHA],
      "source-atop": [gl.DST_ALPHA, gl.ONE_MINUS_SRC_ALPHA],
      "source-in": [gl.DST_ALPHA, gl.ZERO],
      lighter: [gl.ONE, gl.ONE],
    };
  }

  get presenter(): ScheduledPresenter {
    return this.presenterQueue;
  }

  private requireObjects() {
    if (
      !this.scene ||
      !this.solid ||
      !this.textured ||
      !this.positionBuffer ||
      !this.uvBuffer
    )
      throw createCompatError(
        ERROR_CODES.CONTRACT,
        "device objects are missing while the device is active",
      );
    return {
      scene: this.scene,
      solid: this.solid,
      textured: this.textured,
      positionBuffer: this.positionBuffer,
      uvBuffer: this.uvBuffer,
    };
  }

  createGpuObjects(): void {
    const gl = this.gl;
    const solid = makeSolidProgram(gl);
    let textured: TexturedProgram | null = null;
    let positionBuffer: WebGLBuffer | null = null;
    let uvBuffer: WebGLBuffer | null = null;
    try {
      textured = makeTexturedProgram(gl);
      positionBuffer = gl.createBuffer();
      uvBuffer = gl.createBuffer();
      if (!positionBuffer || !uvBuffer)
        throw createCompatError(
          ERROR_CODES.INITIALIZATION,
          "vertex buffer creation failed",
        );
    } catch (failure) {
      gl.deleteProgram(solid.program);
      if (textured) gl.deleteProgram(textured.program);
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
      if (uvBuffer) gl.deleteBuffer(uvBuffer);
      throw failure;
    }
    this.solid = solid;
    this.textured = textured;
    this.positionBuffer = positionBuffer;
    this.uvBuffer = uvBuffer;
  }

  deleteGpuObjects(): void {
    const gl = this.gl;
    if (this.solid) gl.deleteProgram(this.solid.program);
    if (this.textured) gl.deleteProgram(this.textured.program);
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
    if (this.uvBuffer) gl.deleteBuffer(this.uvBuffer);
    this.solid = null;
    this.textured = null;
    this.positionBuffer = null;
    this.uvBuffer = null;
  }

  installScene(scene: SceneFramebuffer): void {
    this.scene = scene;
  }

  /** Idempotent teardown shared by dispose, loss, and init rollback. */
  shutdown(): void {
    this.registry.releaseAll();
    destroySceneFramebuffer(this.gl, this.scene);
    this.scene = null;
    this.deleteGpuObjects();
  }

  /** Re-establish the canonical scene state; every entry point sets its own. */
  bindSceneState(): void {
    const { scene } = this.requireObjects();
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.DEPTH_TEST);
  }

  private applyBlend(composite: CompositeMode | "replace"): void {
    const gl = this.gl;
    if (composite === "replace") {
      gl.disable(gl.BLEND);
      return;
    }
    gl.enable(gl.BLEND);
    const [sourceFactor, destinationFactor] = this.blendFactors[composite];
    gl.blendFuncSeparate(
      sourceFactor,
      destinationFactor,
      sourceFactor,
      destinationFactor,
    );
  }

  private fullscreen(): number[] {
    return [0, 0, this.width, 0, 0, this.height, this.width, this.height];
  }

  private drawSolidQuad(
    corners: number[],
    color: readonly [number, number, number, number],
    composite: CompositeMode | "replace",
  ): void {
    const { solid, positionBuffer } = this.requireObjects();
    const gl = this.gl;
    this.bindSceneState();
    gl.useProgram(solid.program);
    gl.uniform2f(solid.uResolution, this.width, this.height);
    gl.uniform4f(solid.uColor, color[0], color[1], color[2], color[3]);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(corners), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(solid.aPosition);
    gl.vertexAttribPointer(solid.aPosition, 2, gl.FLOAT, false, 0, 0);
    this.applyBlend(composite);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawTexturedQuad(
    texture: WebGLTexture,
    corners: number[],
    uvs: number[],
    alpha: number,
    composite: CompositeMode | "replace",
    target: "scene" | "display",
  ): void {
    const { scene, textured, positionBuffer, uvBuffer } = this.requireObjects();
    const gl = this.gl;
    if (target === "scene") {
      this.bindSceneState();
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.width, this.height);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.DEPTH_TEST);
    }
    gl.useProgram(textured.program);
    gl.uniform2f(textured.uResolution, this.width, this.height);
    gl.uniform1f(textured.uAlpha, alpha);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(
      gl.TEXTURE_2D,
      target === "display" ? scene.texture : texture,
    );
    gl.uniform1i(textured.uTexture, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(corners), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(textured.aPosition);
    gl.vertexAttribPointer(textured.aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(textured.aUv);
    gl.vertexAttribPointer(textured.aUv, 2, gl.FLOAT, false, 0, 0);
    this.applyBlend(composite);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private texturedGeometry(source: RasterSource | ImageDrawSource): {
    corners: number[];
    uvs: number[];
  } {
    if (isRasterSource(source)) {
      const { x, y, width, height } = source.bounds;
      return {
        corners: [x, y, x + width, y, x, y + height, x + width, y + height],
        uvs: [0, 0, 1, 0, 0, 1, 1, 1],
      };
    }
    const corners = rectCorners(source.destinationRect, source.transform);
    const { width, height } = sourcePixels(source.image);
    const { x, y, width: sourceWidth, height: sourceHeight } =
      source.sourceRect;
    const u0 = x / width;
    const v0 = y / height;
    const u1 = (x + sourceWidth) / width;
    const v1 = (y + sourceHeight) / height;
    return { corners, uvs: [u0, v0, u1, v0, u0, v1, u1, v1] };
  }

  draw(operation: DrawOperation): void {
    if (this.status === "disposed")
      throw createCompatError(ERROR_CODES.DISPOSED, "device is disposed");
    if (this.status === "lost") return;
    if (operation.generation !== this.generation)
      throw createCompatError(
        ERROR_CODES.CONTRACT,
        `stale draw operation: generation ${operation.generation}, current ${this.generation}`,
      );
    if (operation.clip !== null)
      throw createCompatError(
        ERROR_CODES.NOT_IMPLEMENTED,
        "stencil clip resolution arrives with the clip feature",
      );
    if (operation.state.filter !== "none")
      throw createCompatError(
        ERROR_CODES.NOT_IMPLEMENTED,
        "filter shading arrives with the composite feature",
      );
    const source = operation.source;
    if (operation.kind === "clear") {
      if (source.kind === "rect")
        this.drawSolidQuad(
          rectCorners(source.bounds, source.transform),
          TRANSPARENT,
          "replace",
        );
    } else if (source.kind === "empty") {
      if (operation.state.composite === "source-in")
        this.drawSolidQuad(this.fullscreen(), TRANSPARENT, "replace");
    } else if (source.kind === "rect") {
      if (source.paint.kind !== "solid")
        throw createCompatError(
          ERROR_CODES.NOT_IMPLEMENTED,
          `paint kind "${source.paint.kind}" arrives with the paint feature`,
        );
      const [r, g, b, a] = source.paint.color;
      const alpha = a * operation.state.alpha;
      this.drawSolidQuad(
        rectCorners(source.bounds, source.transform),
        [r * alpha, g * alpha, b * alpha, alpha],
        operation.state.composite,
      );
    } else {
      const upload = source.kind === "raster" ? source : source.image;
      const lease = this.acquireTexture(upload);
      try {
        const texture = this.registry.payload(lease.handle);
        if (!texture)
          throw createCompatError(
            ERROR_CODES.CONTRACT,
            "uploaded texture is missing",
          );
        const { corners, uvs } = this.texturedGeometry(source);
        this.drawTexturedQuad(
          texture,
          corners,
          uvs,
          operation.state.alpha,
          operation.state.composite,
          "scene",
        );
      } finally {
        lease.release();
      }
    }
    this.presenterQueue.request(this.generation);
  }

  present(generation: number): void {
    if (this.status !== "active") return;
    if (generation !== this.generation) return;
    const { scene } = this.requireObjects();
    this.presentCount += 1;
    this.drawTexturedQuad(
      scene.texture,
      this.fullscreen(),
      [0, 0, 1, 0, 0, 1, 1, 1],
      1,
      "replace",
      "display",
    );
    this.bindSceneState();
  }

  resize(width: number, height: number): void {
    if (this.status === "disposed")
      throw createCompatError(ERROR_CODES.DISPOSED, "device is disposed");
    if (this.status === "lost") return;
    validateSceneSize(width, height, this.maxTextureSize);
    const previousWidth = this.target.width;
    const previousHeight = this.target.height;
    let scene: SceneFramebuffer;
    try {
      this.target.width = width;
      this.target.height = height;
      if (this.target.width !== width || this.target.height !== height)
        throw createCompatError(
          ERROR_CODES.SIZE_UNSUPPORTED,
          `platform refused canvas size ${width}x${height}`,
        );
      scene = createSceneFramebuffer(this.gl, width, height, this.maxTextureSize);
    } catch (failure) {
      this.target.width = previousWidth;
      this.target.height = previousHeight;
      throw failure;
    }
    const generation = this.generation;
    this.presenterQueue.invalidate(generation);
    this.registry.invalidateGeneration(generation);
    destroySceneFramebuffer(this.gl, this.scene);
    this.scene = scene;
    this.width = width;
    this.height = height;
    this.generation = generation + 1;
    this.bindSceneState();
    this.presenterQueue.request(this.generation);
  }

  lose(): void {
    if (this.status !== "active") return;
    const generation = this.generation;
    this.presenterQueue.invalidate(generation);
    this.registry.invalidateGeneration(generation);
    destroySceneFramebuffer(this.gl, this.scene);
    this.scene = null;
    this.deleteGpuObjects();
    this.generation = generation + 1;
    this.status = "lost";
  }

  restore(): void {
    if (this.status === "disposed")
      throw createCompatError(ERROR_CODES.DISPOSED, "device is disposed");
    if (this.status !== "lost")
      throw createCompatError(
        ERROR_CODES.CONTRACT,
        "restore() requires a lost device",
      );
    if (this.gl.isContextLost())
      throw createCompatError(
        ERROR_CODES.CAPABILITY,
        "context is still lost",
      );
    try {
      this.createGpuObjects();
      this.scene = createSceneFramebuffer(
        this.gl,
        this.width,
        this.height,
        this.maxTextureSize,
      );
    } catch (failure) {
      this.deleteGpuObjects();
      destroySceneFramebuffer(this.gl, this.scene);
      this.scene = null;
      throw failure;
    }
    this.generation += 1;
    this.status = "active";
    this.bindSceneState();
    this.presenterQueue.request(this.generation);
  }

  dispose(): void {
    if (this.status === "disposed") return;
    this.presenterQueue.invalidate(this.generation);
    this.generation += 1;
    this.status = "disposed";
    this.owner.releaseAll();
  }

  acquireTexture(source: RasterSource | ImageSource): ResourceLease {
    if (this.status === "disposed")
      throw createCompatError(ERROR_CODES.DISPOSED, "device is disposed");
    if (this.status === "lost")
      throw createCompatError(ERROR_CODES.CAPABILITY, "context is lost");
    const texture = uploadSourceTexture(this.gl, source, this.maxTextureSize);
    return this.registry.acquire(this.generation, texture);
  }

  retain(handle: ResourceHandle): ResourceLease {
    if (this.status === "disposed")
      throw createCompatError(ERROR_CODES.DISPOSED, "device is disposed");
    return this.registry.retain(handle);
  }

  readSceneRaw(): {
    width: number;
    height: number;
    pixels: Uint8Array;
    generation: number;
  } {
    if (this.status === "disposed")
      throw createCompatError(ERROR_CODES.DISPOSED, "device is disposed");
    if (this.status === "lost")
      throw createCompatError(
        ERROR_CODES.CAPABILITY,
        "no live scene during context loss",
      );
    const { scene } = this.requireObjects();
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.framebuffer);
    const pixels = new Uint8Array(this.width * this.height * 4);
    gl.readPixels(
      0,
      0,
      this.width,
      this.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    return {
      width: this.width,
      height: this.height,
      pixels,
      generation: this.generation,
    };
  }

  resourceCounts(): Record<string, number> {
    const counts = this.registry.counts();
    return {
      textures: counts.resources,
      textureLeases: counts.leases,
      sceneFramebuffers: this.scene ? 1 : 0,
      programs: (this.solid ? 1 : 0) + (this.textured ? 1 : 0),
      presents: this.presentCount,
    };
  }
}

/**
 * Create the WebGL 1 scene renderer on a target canvas. Steps run in a fixed
 * order — acquire context, validate attributes and capabilities, allocate
 * programs and the scene framebuffer — and any mid-way failure rolls back the
 * resources already taken without touching the caller's target or losing its
 * context.
 */
export function createSceneRenderer(
  target: TargetCanvas,
  options: SceneRendererOptions = {},
): SceneRenderer {
  if (
    !target ||
    typeof target.getContext !== "function" ||
    typeof target.width !== "number" ||
    typeof target.height !== "number"
  )
    throw createCompatError(
      ERROR_CODES.INVALID_TARGET,
      "target must be a canvas with getContext and numeric dimensions",
    );
  const cleanups: Array<() => void> = [];
  try {
    const gl = acquireWebGLContext(target, options.createProbeCanvas);
    if (options.failAfter === "context")
      throw createCompatError(
        ERROR_CODES.INITIALIZATION,
        "injected failure after context acquisition",
      );
    const { maxTextureSize } = validateContext(gl);
    if (options.failAfter === "attributes")
      throw createCompatError(
        ERROR_CODES.INITIALIZATION,
        "injected failure after attribute validation",
      );
    validateSceneSize(target.width, target.height, maxTextureSize);
    const owner = createResourceOwner();
    const device = new SceneDevice(target, gl, maxTextureSize, owner);
    device.createGpuObjects();
    if (options.failAfter === "programs")
      throw createCompatError(
        ERROR_CODES.INITIALIZATION,
        "injected failure after program setup",
      );
    device.installScene(
      createSceneFramebuffer(gl, target.width, target.height, maxTextureSize),
    );
    cleanups.push(() => device.shutdown());
    if (options.failAfter === "scene")
      throw createCompatError(
        ERROR_CODES.INITIALIZATION,
        "injected failure after scene creation",
      );
    device.bindSceneState();
    owner.register(() => device.shutdown());
    const hooks = createTestHooks({
      readRaw: () => device.readSceneRaw(),
      whenPresented: (generation) => device.presenter.whenPresented(generation),
      counts: () => device.resourceCounts(),
    });
    return { device, presenter: device.presenter, resources: owner, hooks };
  } catch (failure) {
    rollbackInitialization(failure, cleanups);
  }
}
