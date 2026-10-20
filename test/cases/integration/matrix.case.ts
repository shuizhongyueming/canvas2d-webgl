import type { CaseAdapter, CaseDefinition } from "../../types/testing.js";
import { dumpScene } from "../rect/helpers.js";
import { makeSourceCanvas } from "../image/helpers.js";

/**
 * Entry x composite x clip matrix. The destination is an opaque background and
 * the clip is a device-aligned rectangle, so the placement of the operation is
 * exact; the shaded values of antialiased text stay with the render pair.
 * Every entry gets the same clip geometry and the same probe points.
 */

type Entry = "drawImage" | "fillRect" | "path" | "text";

const SIZE = 48;
const BG = [32, 64, 96, 255] as const;
const SRC = [255, 136, 0, 255] as const;
const CLIP = { x: 8, y: 8, width: 24, height: 24 };
const BOX = { x: 0, y: 0, width: 24, height: 24 };

type Mode = "source-over" | "source-atop" | "source-in" | "lighter";
const MODES: readonly Mode[] = [
  "source-over",
  "source-atop",
  "source-in",
  "lighter",
];
const ENTRIES: readonly Entry[] = ["drawImage", "fillRect", "path", "text"];

const base = {
  kind: "combined" as const,
  width: SIZE,
  height: SIZE,
  seed: 1,
  fonts: [] as string[],
};

type Scene = Awaited<ReturnType<typeof dumpScene>>;

function same(actual: readonly number[], expected: readonly number[]): boolean {
  return (
    actual[0] === expected[0] &&
    actual[1] === expected[1] &&
    actual[2] === expected[2] &&
    actual[3] === expected[3]
  );
}

function transparentIn(
  scene: Scene,
  x: number,
  y: number,
  width: number,
  height: number,
): number {
  let total = 0;
  for (let row = y; row < y + height; row += 1)
    for (let column = x; column < x + width; column += 1)
      if (scene.pixel(column, row)[3] === 0) total += 1;
  return total;
}

function differsIn(
  scene: Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  expected: readonly number[],
): number {
  let total = 0;
  for (let row = y; row < y + height; row += 1)
    for (let column = x; column < x + width; column += 1)
      if (!same(scene.pixel(column, row), expected)) total += 1;
  return total;
}

/** 24x24 opaque source for the drawImage entry; rects and paths paint the same box. */
function sourceBox(): HTMLCanvasElement {
  return makeSourceCanvas(BOX.width, BOX.height, (context) => {
    context.fillStyle = "#ff8800";
    context.fillRect(0, 0, BOX.width, BOX.height);
  });
}

/** Native truth for an opaque, unshaded source inside the clip. */
function expectedInside(mode: Mode): readonly number[] {
  switch (mode) {
    case "source-over":
    case "source-atop":
    case "source-in":
      return SRC;
    case "lighter":
      return [255, 200, 96, 255];
  }
}

function requirementOf(entry: Entry): string {
  switch (entry) {
    case "drawImage":
      return "context.drawImage";
    case "fillRect":
      return "context.fillRect";
    case "path":
      return "context.fill";
    case "text":
      return "context.fillText";
  }
}

/** Paint the same source box through the selected entry. */
function paint(
  context: CaseAdapter["context"],
  entry: Entry,
  x: number,
  y: number,
): void {
  if (entry === "drawImage") {
    Reflect.apply(context.drawImage, context, [
      sourceBox(),
      x,
      y,
      BOX.width,
      BOX.height,
    ]);
    return;
  }
  if (entry === "fillRect") {
    context.fillRect(x, y, BOX.width, BOX.height);
    return;
  }
  if (entry === "path") {
    context.beginPath();
    context.rect(x, y, BOX.width, BOX.height);
    context.fill();
    return;
  }
  // Text is the only entry whose coverage is glyph-dependent: one 10px
  // capital sits inside the clip, clear of the probe regions used below.
  context.font = "10px sans-serif";
  context.textBaseline = "top";
  context.textAlign = "left";
  context.fillText("M", x + 12, y + 12);
}

const clipped: CaseDefinition[] = ENTRIES.flatMap((entry) =>
  MODES.map(
    (mode): CaseDefinition => ({
      ...base,
      id: `ACC-03.entry-${entry}-${mode}-clipped`,
      requirements: [
        "ACC-03",
        "context.clip",
        "context.globalCompositeOperation",
        requirementOf(entry),
      ],
      kind: "render",
      async run(a) {
        const context = a.context;
        context.fillStyle = "rgb(32, 64, 96)";
        context.fillRect(0, 0, SIZE, SIZE);
        context.beginPath();
        context.rect(CLIP.x, CLIP.y, CLIP.width, CLIP.height);
        context.clip();
        context.globalCompositeOperation = mode;
        context.fillStyle = "#ff8800";
        paint(context, entry, BOX.x, BOX.y);
        const scene = await dumpScene(a);
        // The clip bounds every entry and composite mode.
        a.assert(
          same(scene.pixel(2, 2), BG),
          "outside the clip keeps the destination",
        );
        a.assert(
          same(scene.pixel(40, 2), BG),
          "right of the clip keeps the destination",
        );
        a.assert(
          same(scene.pixel(2, 40), BG),
          "below the clip keeps the destination",
        );
        if (mode === "source-in") {
          // source-in multiplies the whole effective clip by the source
          // alpha, so every clip pixel the source does not cover is cleared.
          a.assert(
            transparentIn(scene, CLIP.x + 16, CLIP.y + 16, 8, 8) === 64,
            "source-in clears the clip interior outside the source",
          );
          if (entry !== "text")
            a.assert(
              same(scene.pixel(12, 12), SRC),
              "source-in keeps the covered source region",
            );
          return;
        }
        // The other three modes leave the clip interior outside the source
        // untouched because the source is empty there.
        if (entry === "text") {
          a.assert(
            same(scene.pixel(CLIP.x + 20, CLIP.y + 20), BG),
            "outside the glyph box keeps the destination",
          );
          a.assert(
            differsIn(scene, CLIP.x, CLIP.y, CLIP.width, CLIP.height, BG) > 0,
            "text paints inside the clip",
          );
          return;
        }
        a.assert(
          same(scene.pixel(28, 28), BG),
          "inside the clip but outside the source keeps the destination",
        );
        a.assert(
          same(scene.pixel(12, 12), expectedInside(mode)),
          "covered source region follows the composite mode",
        );
      },
    }),
  ),
);

/**
 * The same matrix with globalAlpha, brightness filter and a translation in
 * effect. The clip is constructed in the translated space, so the operation
 * and the clip move together. Shaded values are not pinned by assertion: the
 * render pair carries them (#7 has no quantitative threshold yet), while the
 * structural facts stay exact.
 */
const withState: CaseDefinition[] = ENTRIES.flatMap((entry) =>
  MODES.map(
    (mode): CaseDefinition => ({
      ...base,
      id: `ACC-03.entry-${entry}-${mode}-state`,
      requirements: [
        "ACC-03",
        "context.clip",
        "context.globalAlpha",
        "context.filter",
        "context.translate",
        "context.globalCompositeOperation",
        requirementOf(entry),
      ],
      kind: "render",
      async run(a) {
        const context = a.context;
        context.fillStyle = "rgb(32, 64, 96)";
        context.fillRect(0, 0, SIZE, SIZE);
        context.translate(4, 4);
        context.beginPath();
        context.rect(CLIP.x, CLIP.y, CLIP.width, CLIP.height);
        context.clip();
        context.globalAlpha = 0.5;
        context.filter = "brightness(120%)";
        context.globalCompositeOperation = mode;
        context.fillStyle = "#ff8800";
        paint(context, entry, BOX.x, BOX.y);
        const scene = await dumpScene(a);
        // The clip is at device 12..36 on both axes after the translation.
        a.assert(
          same(scene.pixel(2, 2), BG),
          "state does not move the clip boundary",
        );
        a.assert(
          same(scene.pixel(44, 2), BG),
          "right of the translated clip keeps the destination",
        );
        if (mode === "source-in") {
          a.assert(
            transparentIn(scene, 28, 28, 6, 6) === 36,
            "source-in clears inside the translated clip with alpha and filter",
          );
          return;
        }
        a.assert(
          same(scene.pixel(30, 30), BG),
          "inside the clip but outside the source keeps the destination",
        );
        a.assert(
          differsIn(scene, 14, 14, 8, 8, BG) > 0,
          "the shaded source paints inside the clip",
        );
      },
    }),
  ),
);

export const cases: CaseDefinition[] = [...clipped, ...withState];
