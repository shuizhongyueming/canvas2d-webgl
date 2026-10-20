import type { CaseAdapter } from "../../types/testing.js";
import { loadImage } from "../paint/fixtures.js";

export function drawImage(
  context: CaseAdapter["context"],
  source: HTMLImageElement | HTMLCanvasElement | OffscreenCanvas,
  ...coordinates: [number, number] | [number, number, number, number] |
    [number, number, number, number, number, number, number, number]
): void {
  return Reflect.apply(context.drawImage, context, [source, ...coordinates]);
}

/** Image case helpers. Module scope stays Node-safe: only run() executes in a page. */

/**
 * Build a native offscreen canvas source with deterministic content painted by
 * the callback. Runs only inside a case (document is unavailable in Node).
 */
export function makeSourceCanvas(
  width: number,
  height: number,
  paint: (context: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("source canvas 2d context unavailable");
  paint(context);
  return canvas;
}

/** Snapshot a canvas source into an HTMLImageElement through a PNG data URL. */
export function canvasToImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  return loadImage(canvas.toDataURL("image/png"));
}

/** Solid-color fill helper for source canvases. */
export function fillSource(
  canvas: HTMLCanvasElement,
  color: string,
): HTMLCanvasElement {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("source canvas 2d context unavailable");
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Asymmetric 4x4 source with one opaque color per corner and transparency
 * elsewhere: TL red, TR green, BL blue, BR white. Any flip, swap or unwanted
 * destination clobber shows up immediately in the probe pixels.
 */
export function cornerCanvas(): HTMLCanvasElement {
  return makeSourceCanvas(4, 4, (context) => {
    context.fillStyle = "#ff0000";
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = "#00ff00";
    context.fillRect(3, 0, 1, 1);
    context.fillStyle = "#0000ff";
    context.fillRect(0, 3, 1, 1);
    context.fillStyle = "#ffffff";
    context.fillRect(3, 3, 1, 1);
  });
}

/** Two horizontal bands, red top / blue bottom, 8x8: wide bands keep scaled probes pure. */
export function bandCanvas(): HTMLCanvasElement {
  return makeSourceCanvas(8, 8, (context) => {
    context.fillStyle = "#ff0000";
    context.fillRect(0, 0, 8, 4);
    context.fillStyle = "#0000ff";
    context.fillRect(0, 4, 8, 4);
  });
}
