import type { CaseAdapter } from "../../types/testing.js";
import type { createCompatCanvas } from "../../../src/index.js";

/** Compiled-runtime entry point; types come from the sources. */
export interface FactoryModule {
  readonly createCompatCanvas: typeof createCompatCanvas;
}

export async function loadFactory(): Promise<FactoryModule> {
  return (await import(
    new URL("../../../../dist/index.js", import.meta.url).href
  )) as FactoryModule;
}

/** Stable error observation: the compat code when present, else the error name. */
export function outcome(fn: () => void): string {
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

/** Only the compat canvas carries the library-level dispose entry point. */
export function isCompat(adapter: CaseAdapter): boolean {
  return "dispose" in adapter.canvas;
}

export function makeTarget(width = 8, height = 6): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
