import type { NativeCanvas } from "../../../src/api.js";
import type {
  DrawState,
  Paint,
  RasterSource,
  Rasterizer,
} from "../../../src/internal/contracts.js";
import { createRepeatPattern } from "../../../src/paint/pattern.js";
import { createRasterizer } from "../../../src/raster/rasterizer.js";
import type { CaseAdapter } from "../../types/testing.js";

export const IDENTITY = [1, 0, 0, 1, 0, 0] as const;

/** Every lab canvas lives in the same fixed device space as its reference. */
export const SCENE = { width: 200, height: 200 };

export function makeState(overrides: Partial<DrawState> = {}): DrawState {
  return {
    transform: [1, 0, 0, 1, 0, 0],
    fill: { kind: "solid", color: [0.8, 0.1, 0.2, 1] },
    stroke: { kind: "solid", color: [0.1, 0.25, 0.75, 1] },
    alpha: 1,
    composite: "source-over",
    filter: "none",
    lineWidth: 2,
    lineCap: "butt",
    lineJoin: "miter",
    font: "16px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    clip: null,
    ...overrides,
  };
}

export interface Lab {
  readonly rasterizer: Rasterizer;
  /** Every canvas the factory produced, in creation order. */
  readonly created: NativeCanvas[];
}

export function makeLab(
  options: {
    maxEntries?: number;
    maxPixels?: number;
    maxTextureDimension?: number;
  } = {},
): Lab {
  const created: NativeCanvas[] = [];
  const rasterizer = createRasterizer({
    createCanvas: (width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      created.push(canvas);
      return canvas;
    },
    sceneExtent: () => SCENE,
    maxEntries: options.maxEntries,
    maxPixels: options.maxPixels,
    maxTextureDimension: options.maxTextureDimension,
  });
  return { rasterizer, created };
}

/** A 4x4 checkerboard decoded as an image, for repeat-pattern paints. */
export async function loadTileImage(): Promise<HTMLImageElement> {
  const tile = document.createElement("canvas");
  tile.width = 4;
  tile.height = 4;
  const tctx = tile.getContext("2d");
  if (!tctx) throw new Error("native 2d context unavailable");
  tctx.fillStyle = "#ff0000";
  tctx.fillRect(0, 0, 4, 4);
  tctx.fillStyle = "#00ff00";
  tctx.fillRect(0, 0, 2, 2);
  tctx.fillRect(2, 2, 2, 2);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("tile image decode failed"));
    image.src = tile.toDataURL("image/png");
  });
  return image;
}

/**
 * Build the repeat-pattern Paint for the checkerboard tile through the real
 * creation-time capture of the paint feature, so the raster cases consume
 * exactly the frozen bitmap the library produces. The loaded image is
 * returned alongside for the native reference render.
 */
export async function loadTilePaint(
  id: number,
): Promise<{ image: HTMLImageElement; paint: Paint }> {
  const image = await loadTileImage();
  const pattern = createRepeatPattern(
    image,
    "repeat",
    2,
    () => id,
    (width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    },
  );
  if (!pattern) throw new Error("tile pattern unavailable");
  return { image, paint: pattern.snapshot() };
}

export function referenceContext(): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = SCENE.width;
  canvas.height = SCENE.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("native 2d context unavailable");
  return ctx;
}

function readRegion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): Uint8ClampedArray {
  return ctx.getImageData(x, y, width, height).data;
}

export function sourcePixels(source: RasterSource): Uint8ClampedArray {
  const context = source.canvas.getContext(
    "2d",
  ) as CanvasRenderingContext2D | null;
  if (!context) throw new Error("asset canvas is not readable");
  return readRegion(context, 0, 0, source.pixelWidth, source.pixelHeight);
}

/**
 * Pure measurement: byte differences inside the coverage region plus ink in the
 * reference that escapes the asset bounds. No verdicts, no thresholds.
 */
export function diffAsset(
  reference: CanvasRenderingContext2D,
  source: RasterSource,
): { mismatched: number; escaped: number } {
  const asset = sourcePixels(source);
  const { bounds } = source;
  if (bounds.width === 0 || bounds.height === 0) {
    let ink = 0;
    for (let i = 3; i < asset.length; i += 4) if (asset[i] !== 0) ink += 1;
    const scene = readRegion(reference, 0, 0, SCENE.width, SCENE.height);
    for (let i = 3; i < scene.length; i += 4) if (scene[i] !== 0) ink += 1;
    return { mismatched: ink, escaped: 0 };
  }
  const covered = readRegion(
    reference,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
  );
  let mismatched = covered.length === asset.length ? 0 : 1;
  for (let i = 0; i < asset.length && i < covered.length; i += 1)
    if (asset[i] !== covered[i]) mismatched += 1;
  const scene = readRegion(reference, 0, 0, SCENE.width, SCENE.height);
  let escaped = 0;
  for (let y = 0; y < SCENE.height; y += 1) {
    for (let x = 0; x < SCENE.width; x += 1) {
      const inside =
        x >= bounds.x &&
        x < bounds.x + bounds.width &&
        y >= bounds.y &&
        y < bounds.y + bounds.height;
      if (!inside && scene[(y * SCENE.width + x) * 4 + 3] !== 0) escaped += 1;
    }
  }
  return { mismatched, escaped };
}

/**
 * The asset must equal the native render exactly inside its coverage region
 * (painted at the exact scene position with the recorded transforms, then
 * cropped) and the reference must hold no ink outside that region (the asset
 * never truncates the painting).
 */
export function compareAsset(
  a: CaseAdapter,
  reference: CanvasRenderingContext2D,
  source: RasterSource,
  label: string,
): void {
  const { bounds } = source;
  if (bounds.width === 0 || bounds.height === 0) {
    const { mismatched } = diffAsset(reference, source);
    a.assert(
      mismatched === 0,
      `${label}: degenerate asset and native render are both empty`,
    );
    return;
  }
  const { mismatched, escaped } = diffAsset(reference, source);
  a.observe(`${label}:mismatched-bytes`, mismatched);
  a.assert(mismatched === 0, `${label}: asset bytes equal the native render`);
  a.observe(`${label}:escaped-pixels`, escaped);
  a.assert(escaped === 0, `${label}: asset bounds never truncate the painting`);
}
