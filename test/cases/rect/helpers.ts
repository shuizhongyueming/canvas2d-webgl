import type { CaseAdapter, TestHooks } from "../../types/testing.js";
import { isCompat } from "../shared.js";

/** Rect case helpers. Module scope stays Node-safe: only run() executes in a page. */

export type Pixel = readonly [number, number, number, number];

interface BridgeModule {
  hooksFor(canvas: unknown): TestHooks;
}

/**
 * The test-side hook lookup crosses the source/compiled boundary exactly like
 * shared.ts crosses into dist: bridge.js is served from the source tree, while
 * this module is compiled into .build, so the specifier is a computed URL.
 */
export async function hooksOf(a: CaseAdapter): Promise<TestHooks | null> {
  if (!isCompat(a)) return null;
  const bridge = (await import(
    new URL("../../../../test/harness/bridge.js", import.meta.url).href
  )) as BridgeModule;
  return bridge.hooksFor(a.canvas);
}

export interface SceneDump {
  readonly width: number;
  readonly height: number;
  readonly generation: number;
  pixel(x: number, y: number): Pixel;
  count(predicate: (pixel: Pixel) => boolean): number;
}

/**
 * Read the current scene on either side: the GPU test hook on compat, native
 * getImageData on the reference. Observation only; never drives a present.
 */
export async function dumpScene(a: CaseAdapter): Promise<SceneDump> {
  const width = a.canvas.width;
  const height = a.canvas.height;
  let data: Uint8Array | Uint8ClampedArray;
  let generation = 0;
  const hooks = await hooksOf(a);
  if (hooks) {
    const scene = hooks.readScene();
    data = scene.pixels;
    generation = scene.generation;
  } else {
    const context = a.context as CanvasRenderingContext2D;
    data = context.getImageData(0, 0, width, height).data;
  }
  const pixel = (x: number, y: number): Pixel => {
    const offset = (y * width + x) * 4;
    return [
      data[offset] as number,
      data[offset + 1] as number,
      data[offset + 2] as number,
      data[offset + 3] as number,
    ];
  };
  return {
    width,
    height,
    generation,
    pixel,
    count(predicate) {
      let total = 0;
      for (let y = 0; y < height; y += 1)
        for (let x = 0; x < width; x += 1)
          if (predicate(pixel(x, y))) total += 1;
      return total;
    },
  };
}

/** Call a rect method outside its declared signature (arity/type edges). */
export function callRect(
  context: unknown,
  method: "fillRect" | "clearRect" | "strokeRect",
  ...args: unknown[]
): unknown {
  return Reflect.apply(
    (context as Record<string, (...realArgs: unknown[]) => unknown>)[method]!,
    context,
    args,
  );
}

/** Record the stable identity of an invocation: "ok", the compat code, or the error name. */
export function rectOutcome(fn: () => unknown): string {
  try {
    fn();
    return "ok";
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" ? name : "unknown";
  }
}

/** Full error message, so native and compat argument errors compare verbatim. */
export function rectMessage(fn: () => unknown): string {
  try {
    fn();
    return "ok";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export const TRANSPARENT: Pixel = [0, 0, 0, 0];

export function pixelsEqual(actual: Pixel, expected: Pixel): boolean {
  return (
    actual[0] === expected[0] &&
    actual[1] === expected[1] &&
    actual[2] === expected[2] &&
    actual[3] === expected[3]
  );
}

/**
 * Read one pixel of the DISPLAY surface (device space, top-left origin). On
 * native the canvas bitmap is what the compositor shows. On compat the target
 * is a WebGL canvas: present() rebinds the scene FBO when it returns, so the
 * default framebuffer is bound explicitly here; and the drawing buffer is not
 * preserved, so the read is only valid in the microtask window right after
 * whenPresented() resolves, before the next composite clears it. The harness
 * attaches the target element with id "target".
 */
export async function displayPixel(
  a: CaseAdapter,
  x: number,
  y: number,
): Promise<Pixel> {
  if (!isCompat(a)) {
    const context = a.context as CanvasRenderingContext2D;
    const data = context.getImageData(x, y, 1, 1).data;
    return [
      data[0] as number,
      data[1] as number,
      data[2] as number,
      data[3] as number,
    ];
  }
  const target = document.getElementById("target") as HTMLCanvasElement | null;
  const gl = target?.getContext("webgl") as WebGLRenderingContext | null;
  if (!gl) throw new Error("display surface is not a WebGL canvas");
  // present() leaves the scene FBO bound; the display lives on the default
  // framebuffer. Draw entry points re-establish scene state themselves, so
  // this rebinding cannot disturb later draws.
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const pixel = new Uint8Array(4);
  gl.readPixels(
    x,
    gl.drawingBufferHeight - 1 - y,
    1,
    1,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixel,
  );
  return [
    pixel[0] as number,
    pixel[1] as number,
    pixel[2] as number,
    pixel[3] as number,
  ];
}
