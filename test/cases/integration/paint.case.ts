import type { CaseAdapter, CaseDefinition } from "../../types/testing.js";
import { STRIPES_3x5, loadImage } from "../paint/fixtures.js";
import { dumpScene, pixelsEqual } from "../rect/helpers.js";
import { assignStyle } from "../text/helpers.js";

const base = {
  kind: "combined" as const,
  width: 48,
  height: 48,
  seed: 1,
  fonts: [] as string[],
};

type Scene = Awaited<ReturnType<typeof dumpScene>>;
type Rect = readonly [x: number, y: number, width: number, height: number];

const RED = [255, 0, 0, 255] as const;
const BLUE = [0, 0, 255, 255] as const;

function same(actual: readonly number[], expected: readonly number[]): boolean {
  return pixelsEqual(actual as never, expected as never);
}

function countIn(
  scene: Scene,
  area: Rect,
  expected: readonly number[],
): number {
  let total = 0;
  const [x, y, width, height] = area;
  for (let row = y; row < y + height; row += 1)
    for (let column = x; column < x + width; column += 1)
      if (same(scene.pixel(column, row), expected)) total += 1;
  return total;
}

/** A pixel whose blue channel dominates, i.e. the post-mutation blue stop. */
function blueDominant(pixel: readonly number[]): boolean {
  return (
    (pixel[3] as number) > 0 && (pixel[2] as number) > (pixel[0] as number)
  );
}

/** A pixel carrying the post-mutation blue stop; exact red pixels are excluded. */
function blueish(scene: Scene, area: Rect): number {
  let total = 0;
  const [x, y, width, height] = area;
  for (let row = y; row < y + height; row += 1)
    for (let column = x; column < x + width; column += 1) {
      const pixel = scene.pixel(column, row);
      if (pixel[3] > 0 && (pixel[2] as number) > (pixel[0] as number))
        total += 1;
    }
  return total;
}

const TEXT_AREA: Rect = [32, 0, 16, 16] as const;
const RECT_AREA: Rect = [0, 0, 16, 16] as const;
const PATH_FILL_AREA: Rect = [0, 20, 16, 16] as const;

/**
 * Paint versions across entries: one gradient object is shared by a rect fill,
 * a rect stroke, a path fill, a path stroke and a glyph run. addColorStop bumps
 * the paint version, so every retained native asset (rect paint, path
 * fill/stroke, glyph run) must be re-rasterized instead of serving the stale
 * cached material.
 */
export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "ACC-03.paint-version",
    requirements: [
      "ACC-03",
      "gradient.addColorStop",
      "context.fillStyle",
      "context.strokeStyle",
      "context.fillRect",
      "context.strokeRect",
      "context.fill",
      "context.stroke",
      "context.fillText",
    ],
    display: {
      status: "included",
      observation:
        "渐变 addColorStop 后五种入口的旧红色资产全部重栅格为含蓝渐变",
    },
    async run(a) {
      const context = a.context;
      // The ramp spans the whole canvas so every entry below lies inside it.
      const ramp = context.createLinearGradient(0, 0, 48, 0);
      ramp.addColorStop(0, "#ff0000");
      ramp.addColorStop(1, "#ff0000");
      assignStyle(context, "fillStyle", ramp);
      assignStyle(context, "strokeStyle", ramp);
      context.lineWidth = 2;
      context.font = "16px sans-serif";
      context.textBaseline = "top";
      context.textAlign = "left";
      const drawAll = (): void => {
        context.fillRect(0, 0, 16, 16);
        context.strokeRect(20, 4, 12, 12);
        context.beginPath();
        context.rect(0, 20, 16, 16);
        context.fill();
        context.beginPath();
        context.rect(20, 20, 12, 12);
        context.stroke();
        context.fillText("H", 33, 0);
      };
      drawAll();
      const before = await dumpScene(a);
      a.assert(
        countIn(before, RECT_AREA, RED) === RECT_AREA[2] * RECT_AREA[3],
        "the fillRect paints the whole box with the red gradient",
      );
      a.assert(
        countIn(before, [19, 3, 2, 2] as const, RED) === 4,
        "the strokeRect paints its top edge with the red gradient",
      );
      a.assert(
        countIn(before, PATH_FILL_AREA, RED) ===
          PATH_FILL_AREA[2] * PATH_FILL_AREA[3],
        "the path fill paints the whole box with the red gradient",
      );
      a.assert(
        same(before.pixel(20, 24), RED),
        "the path stroke paints with the red gradient",
      );
      a.assert(
        countIn(before, TEXT_AREA, RED) > 0,
        "the glyph run paints with the red gradient",
      );

      // Stop updates are not a re-assignment: the same paint object gains a
      // blue mid stop, so the cached red assets must all be invalidated. The
      // mid stop makes the exact shaded values a ramped interpolation, which
      // the render pair carries; the blue-dominance counts are exact facts.
      ramp.addColorStop(0.5, "#0000ff");
      drawAll();
      const after = await dumpScene(a);
      for (const [label, area] of [
        ["fillRect", RECT_AREA],
        ["strokeRect", [19, 3, 2, 2] as const],
        ["path fill", PATH_FILL_AREA],
        ["path stroke", [20, 20, 12, 12] as const],
        ["glyph run", TEXT_AREA],
      ] as const) {
        a.assert(
          blueish(after, area) > 0,
          `the ${label} re-rasterizes after the stop mutation`,
        );
        a.assert(
          blueish(before, area) === 0,
          `the ${label} had no blue before the mutation`,
        );
      }
      a.observe("rect", after.pixel(8, 8));
      a.observe("pathFill", after.pixel(8, 28));
    },
  },
  {
    ...base,
    id: "ACC-03.paint-version-transform",
    requirements: [
      "ACC-03",
      "gradient.addColorStop",
      "context.translate",
      "context.setTransform",
      "context.fillRect",
      "context.fill",
    ],
    display: {
      status: "included",
      observation: "同一渐变在不同变换下各自缓存；stop 变更后矩形与路径都更新",
    },
    async run(a) {
      const context = a.context;
      const ramp = context.createLinearGradient(0, 0, 16, 0);
      ramp.addColorStop(0, "#ff0000");
      ramp.addColorStop(1, "#ff0000");
      assignStyle(context, "fillStyle", ramp);
      context.fillRect(0, 0, 16, 16);
      const first = await dumpScene(a);
      a.assert(same(first.pixel(8, 8), RED), "the untranslated fill is red");
      // Same paint version, different draw-time space: the cache key must
      // include the transform, so the translated fill cannot reuse the
      // untranslated raster.
      context.translate(24, 0);
      context.fillRect(0, 0, 16, 16);
      const moved = await dumpScene(a);
      a.assert(
        same(moved.pixel(8, 8), RED) && same(moved.pixel(32, 8), RED),
        "the translated fill paints at its device position as well",
      );
      a.assert(
        same(moved.pixel(40, 8), [0, 0, 0, 0]),
        "the translated fill does not extend past its geometry",
      );
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.beginPath();
      context.rect(0, 24, 16, 16);
      context.fill();
      // A single mid stop keeps the sampled 8px offset exactly blue. Adding
      // a second stop at an existing offset would insert it next to the old
      // one, so the ramp would interpolate red-blue-red instead.
      ramp.addColorStop(0.5, "#0000ff");
      context.fillRect(0, 0, 16, 16);
      context.fill();
      const after = await dumpScene(a);
      // The mid stop makes x=8 exactly the blue stop; the 8-bit ramp lands on
      // near-blue rather than 0,0,255, so the exact shaded value stays with
      // the render pair and the assertion pins the channel dominance.
      a.assert(
        blueDominant(after.pixel(8, 8)) && blueDominant(after.pixel(8, 28)),
        "the new paint version reaches both the rect and the path entries",
      );
      a.assert(
        !blueDominant(first.pixel(8, 8)),
        "the earlier fill had no blue contribution",
      );
      a.observe("translatedFill", moved.pixel(32, 8));
    },
  },
  {
    ...base,
    id: "ACC-03.paint-pattern-cache",
    requirements: [
      "ACC-03",
      "context.createPattern",
      "context.translate",
      "context.fillRect",
      "context.fillText",
    ],
    display: {
      status: "included",
      observation: "图案平铺相位随绘制时变换平移；图案同样用于文字填充",
    },
    async run(a) {
      const context = a.context;
      const pattern = context.createPattern(
        await loadImage(STRIPES_3x5),
        "repeat",
      );
      a.assert(pattern !== null, "repeat pattern created");
      assignStyle(context, "fillStyle", pattern);
      context.fillRect(0, 0, 24, 15);
      const untranslated = await dumpScene(a);
      // The captured 3x5 tile repeats: column 0 red, 1 green, 2 blue.
      const stripe = (scene: Scene, x: number, y: number): string => {
        const pixel = scene.pixel(x, y);
        if (same(pixel, [255, 0, 0, 255])) return "red";
        if (same(pixel, [0, 255, 0, 255])) return "green";
        if (same(pixel, [0, 0, 255, 255])) return "blue";
        return pixel.join(",");
      };
      a.assert(
        stripe(untranslated, 0, 0) === "red" &&
          stripe(untranslated, 1, 0) === "green" &&
          stripe(untranslated, 2, 0) === "blue",
        "the tile repeats in source order",
      );
      a.assert(
        stripe(untranslated, 3, 0) === "red",
        "the tile wraps after its width",
      );
      // Translation shifts the tile phase in draw-time space; the same pattern
      // object must not serve the untranslated phase.
      context.translate(1, 0);
      context.fillRect(-1, 15, 24, 15);
      const shifted = await dumpScene(a);
      // The fill starts at user x=-1 under translate(1,0), i.e. device 0 maps
      // to tile column -1 (mod 3 = 2), so the phase must be the -1 shift.
      a.assert(
        same(shifted.pixel(0, 20), untranslated.pixel(2, 0)) &&
          same(shifted.pixel(1, 20), untranslated.pixel(0, 0)) &&
          same(shifted.pixel(2, 20), untranslated.pixel(1, 0)),
        "the translated fill uses the shifted phase, not the cached phase",
      );
      // Pattern + text share the paint path but a different asset kind.
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.font = "16px sans-serif";
      context.textBaseline = "top";
      context.fillText("II", 0, 32);
      const text = await dumpScene(a);
      a.assert(
        countIn(text, [0, 32, 16, 16] as const, [255, 0, 0, 255]) > 0 ||
          countIn(text, [0, 32, 16, 16] as const, [0, 255, 0, 255]) > 0 ||
          countIn(text, [0, 32, 16, 16] as const, [0, 0, 255, 255]) > 0,
        "the pattern also paints the text entry",
      );
      a.observe("tile", [
        stripe(untranslated, 0, 0),
        stripe(untranslated, 1, 0),
        stripe(untranslated, 2, 0),
      ]);
    },
  },
];
