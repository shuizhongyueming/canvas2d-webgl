import type { CaseAdapter, TestHooks } from "../../types/testing.js";
import type { CompatCanvas, CompatContext, CompatOptions } from "../../../src/api.js";
import { loadFactory, makeTarget } from "../shared.js";

/**
 * Lifecycle cases need their own canvas: context-loss callbacks are creation
 * options, and the harness-created adapter never receives them. The reference
 * side runs the same library code (as canvas.dispose.contract does), because
 * native Canvas 2D has no library dispose or WebGL loss semantics to compare
 * against.
 */
export interface CompatHandle {
  readonly target: HTMLCanvasElement;
  readonly canvas: CompatCanvas<HTMLCanvasElement>;
  readonly context: CompatContext<HTMLCanvasElement>;
  readonly gl: WebGLRenderingContext;
  readonly hooks: TestHooks;
}

interface BridgeModule {
  hooksFor(canvas: unknown): TestHooks;
}

export async function hooksFor(canvas: unknown): Promise<TestHooks> {
  const bridge = (await import(
    new URL("../../../../test/harness/bridge.js", import.meta.url).href
  )) as BridgeModule;
  return bridge.hooksFor(canvas);
}

export async function makeCompat(
  width = 8,
  height = 6,
  options?: CompatOptions,
): Promise<CompatHandle> {
  const { createCompatCanvas } = await loadFactory();
  const target = makeTarget(width, height);
  const canvas = createCompatCanvas(target, options);
  const context = canvas.getContext("2d");
  const gl = target.getContext("webgl") as WebGLRenderingContext | null;
  if (!gl) throw new Error("compat target is not bound to WebGL 1");
  return {
    target,
    canvas,
    context,
    gl,
    hooks: await hooksFor(canvas),
  };
}

export type Pixel = readonly [number, number, number, number];
export const RED: Pixel = [255, 0, 0, 255];
export const GREEN: Pixel = [0, 255, 0, 255];
export const TRANSPARENT: Pixel = [0, 0, 0, 0];
export const BLUE: Pixel = [0, 0, 255, 255];

export function pixelAt(
  scene: { readonly width: number; readonly pixels: Uint8Array },
  x: number,
  y: number,
): Pixel {
  const offset = (y * scene.width + x) * 4;
  const channel = (index: number) => scene.pixels[offset + index] as number;
  return [channel(0), channel(1), channel(2), channel(3)];
}

export function pixelsEqual(actual: Pixel, expected: Pixel): boolean {
  return (
    actual[0] === expected[0] &&
    actual[1] === expected[1] &&
    actual[2] === expected[2] &&
    actual[3] === expected[3]
  );
}

export function countPixels(
  scene: { readonly width: number; readonly height: number; readonly pixels: Uint8Array },
  predicate: (pixel: Pixel) => boolean,
): number {
  let total = 0;
  for (let y = 0; y < scene.height; y += 1)
    for (let x = 0; x < scene.width; x += 1)
      if (predicate(pixelAt(scene, x, y))) total += 1;
  return total;
}

export function isTransparent(pixel: Pixel): boolean {
  return pixel[3] === 0;
}

/** Display readback binds the default framebuffer; coordinates are top-left. */
export function displayPixel(
  gl: WebGLRenderingContext,
  width: number,
  height: number,
  x: number,
  y: number,
): Pixel {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const pixel = new Uint8Array(4);
  gl.readPixels(x, height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  const channel = (index: number) => pixel[index] as number;
  return [channel(0), channel(1), channel(2), channel(3)];
}

export function task(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Poll a synchronous fact across event tasks; failure is explicit, never a silent pass. */
export async function waitFor(
  predicate: () => boolean,
  label: string,
  timeout = 5000,
): Promise<void> {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeout)
      throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export function settle(promise: Promise<void>): Promise<{ outcome: string }> {
  return promise.then(
    () => ({ outcome: "resolved" }),
    (error: { code?: string }) => ({ outcome: error.code ?? "rejected" }),
  );
}

export function capture(fn: () => unknown): string {
  try {
    fn();
    return "ok";
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
    return String((error as { name?: unknown }).name ?? "unknown");
  }
}

/**
 * Shared pixel evidence for combined lifecycle cases: both adapters draw the
 * same opaque rectangle through the harness canvas, so the captured render
 * pair is not vacuous even when the case's library assertions use their own
 * canvas.
 */
export function drawHarnessMarker(a: CaseAdapter): void {
  a.context.fillStyle = "#ff0000";
  a.context.fillRect(0, 0, Math.min(4, a.canvas.width), Math.min(4, a.canvas.height));
}

/** Wait for the scheduled present of the given generation without forcing one. */
export async function present(hooks: TestHooks): Promise<number> {
  const { generation } = hooks.readScene();
  await hooks.whenPresented(generation);
  return generation;
}
