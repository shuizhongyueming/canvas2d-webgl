import type * as gpu from "../../../src/gpu/index.js";
import type { TestHooks } from "../../types/testing.js";
import type {
  Bounds,
  DrawOperation,
  DrawState,
  GPUDevice,
  Matrix,
  RasterSource,
} from "../../../src/internal/contracts.js";

export type GpuModule = typeof gpu;

/**
 * Cases are compiled to /.build/test/... and consume the compiled runtime at
 * /dist/...; types come from the sources so a clean checkout still type-checks.
 */
export async function loadGpu(): Promise<GpuModule> {
  return (await import(
    new URL("../../../../dist/gpu/index.js", import.meta.url).href
  )) as GpuModule;
}

/** Pin the internal hook shape to the frozen test protocol. */
export function asTestHooks(hooks: gpu.SceneTestHooks): TestHooks {
  return hooks;
}

export interface RendererHandle {
  readonly gpu: GpuModule;
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGLRenderingContext;
  readonly device: GPUDevice;
  readonly hooks: TestHooks;
  readonly renderer: gpu.SceneRenderer;
}

export async function makeRenderer(
  width: number,
  height: number,
  options?: gpu.SceneRendererOptions,
): Promise<RendererHandle> {
  const gpuModule = await loadGpu();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const renderer = gpuModule.createSceneRenderer(canvas, options);
  const gl = canvas.getContext("webgl") as WebGLRenderingContext;
  return {
    gpu: gpuModule,
    canvas,
    gl,
    device: renderer.device,
    hooks: asTestHooks(renderer.hooks),
    renderer,
  };
}

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
export const RED = [1, 0, 0, 1] as const;
export const GREEN = [0, 1, 0, 1] as const;
export const BLUE = [0, 0, 1, 1] as const;

export function drawState(overrides: Partial<DrawState> = {}): DrawState {
  return {
    transform: IDENTITY,
    fill: { kind: "solid", color: [0, 0, 0, 1] },
    stroke: { kind: "solid", color: [0, 0, 0, 1] },
    alpha: 1,
    composite: "source-over",
    filter: "none",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    clip: null,
    ...overrides,
  };
}

export function rectDraw(
  generation: number,
  bounds: Bounds,
  color: readonly [number, number, number, number],
  state: Partial<DrawState> = {},
): DrawOperation {
  return {
    generation,
    kind: "draw",
    state: drawState(state),
    source: {
      kind: "rect",
      bounds,
      transform: IDENTITY,
      paint: { kind: "solid", color },
    },
    sourceBounds: bounds,
    clip: null,
  };
}

export function clearOp(
  generation: number,
  bounds: Bounds,
  transform: Matrix = IDENTITY,
): DrawOperation {
  return {
    generation,
    kind: "clear",
    state: drawState(),
    source: {
      kind: "rect",
      bounds,
      transform,
      paint: { kind: "solid", color: [0, 0, 0, 1] },
    },
    sourceBounds: bounds,
    clip: null,
  };
}

export function rasterDraw(
  generation: number,
  source: RasterSource,
  state: Partial<DrawState> = {},
): DrawOperation {
  return {
    generation,
    kind: "draw",
    state: drawState(state),
    source,
    sourceBounds: source.bounds,
    clip: null,
  };
}

export function makeRasterSource(
  width: number,
  height: number,
  bounds: Bounds,
  paint: (context: CanvasRenderingContext2D) => void,
): RasterSource {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2d context unavailable for raster fixture");
  paint(context);
  return {
    kind: "raster",
    canvas,
    bounds,
    pixelWidth: width,
    pixelHeight: height,
    colorSpace: "srgb",
    alpha: "straight",
    release() {
      /* call-counting belongs to the owning test */
    },
  };
}

export type Pixel = [number, number, number, number];

export function pixelAt(
  scene: { width: number; pixels: Uint8Array },
  x: number,
  y: number,
): Pixel {
  const offset = (y * scene.width + x) * 4;
  const channel = (index: number) => scene.pixels[offset + index] as number;
  return [channel(0), channel(1), channel(2), channel(3)];
}

export function countPixels(
  scene: { width: number; height: number; pixels: Uint8Array },
  predicate: (pixel: Pixel) => boolean,
): number {
  let count = 0;
  for (let y = 0; y < scene.height; y += 1)
    for (let x = 0; x < scene.width; x += 1)
      if (predicate(pixelAt(scene, x, y))) count += 1;
  return count;
}

export const isTransparent = (pixel: Pixel): boolean =>
  pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 0 && pixel[3] === 0;

/** Direct default-framebuffer readback: display evidence, separate from the scene hook. */
export function readDisplayPixel(
  gl: WebGLRenderingContext,
  x: number,
  y: number,
): Pixel {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const pixel = new Uint8Array(4);
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  const channel = (index: number) => pixel[index] as number;
  return [channel(0), channel(1), channel(2), channel(3)];
}

export function captureError(run: () => void): { code: string } | null {
  try {
    run();
    return null;
  } catch (error) {
    return { code: (error as { code?: string })?.code ?? "unknown" };
  }
}

export function settle(promise: Promise<void>): Promise<{ outcome: string }> {
  return promise.then(
    () => ({ outcome: "resolved" }),
    (error) => ({ outcome: (error as { code?: string })?.code ?? "rejected" }),
  );
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function task(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function waitFor(
  condition: () => boolean,
  timeout = 3000,
): Promise<boolean> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) return false;
    await nextFrame();
  }
  return true;
}
