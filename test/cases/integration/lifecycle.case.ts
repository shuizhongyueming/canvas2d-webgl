import type { CaseDefinition } from "../../types/testing.js";
import { STRIPES_3x5, loadImage } from "../paint/fixtures.js";
import { assignStyle } from "../text/helpers.js";
import { dumpScene } from "../rect/helpers.js";
import {
  capture,
  makeCompat,
  pixelAt,
  pixelsEqual,
  settle,
  task,
  type CompatHandle,
} from "../lifecycle/helpers.js";

const base = {
  kind: "combined" as const,
  width: 32,
  height: 32,
  seed: 1,
  fonts: [] as string[],
};

const RED = [255, 0, 0, 255] as const;
const GREEN = [0, 255, 0, 255] as const;
const TRANSPARENT = [0, 0, 0, 0] as const;

/** Populate every retained-asset family: text, path fill/stroke, clip mask, pattern. */
async function fillCaches(context: CompatHandle["context"]): Promise<void> {
  context.fillStyle = "#ff0000";
  context.fillRect(0, 0, 32, 32);
  context.font = "16px sans-serif";
  context.textBaseline = "top";
  context.fillText("Ag", 2, 2);
  context.lineWidth = 2;
  context.strokeStyle = "#00ff00";
  context.beginPath();
  context.moveTo(2, 30);
  context.lineTo(30, 30);
  context.stroke();
  const pattern = context.createPattern(await loadImage(STRIPES_3x5), "repeat");
  assignStyle(context, "fillStyle", pattern);
  context.fillRect(0, 20, 12, 6);
  context.beginPath();
  context.rect(2, 2, 12, 12);
  context.clip();
}

/** Pixels inside the area that differ from the expected color. */
function differing(
  scene: ReturnType<CompatHandle["hooks"]["readScene"]>,
  x: number,
  y: number,
  width: number,
  height: number,
  expected: readonly [number, number, number, number],
): number {
  let total = 0;
  for (let row = y; row < y + height; row += 1)
    for (let column = x; column < x + width; column += 1)
      if (!pixelsEqual(pixelAt(scene, column, row), expected)) total += 1;
  return total;
}

function textureCount(handle: CompatHandle): number {
  return handle.hooks.resourceCounts().textures ?? -1;
}

export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "ACC-05.dispose-clears-assets-and-present",
    requirements: ["LIFE-01", "ACC-05", "CAN-05"],
    async run(a) {
      const handle = await makeCompat(32, 32);
      const { context, canvas, hooks } = handle;
      try {
        await fillCaches(context);
        // Every family above is resident through the raster cache, not the GPU
        // registry: the device must hold no leaked texture lease after draws.
        a.assert(
          (hooks.resourceCounts().textureLeases ?? -1) === 0,
          "draws release their upload leases",
        );
        const drawn = hooks.readScene();
        a.assert(
          pixelsEqual(pixelAt(drawn, 2, 2), RED),
          "the clipped fill made it into the scene",
        );

        // A pending present from the same task must not survive disposal.
        context.fillStyle = "#0000ff";
        context.fillRect(0, 0, 32, 32);
        const generation = hooks.readScene().generation;
        const waiting = settle(hooks.whenPresented(generation));
        canvas.dispose();
        const outcome = await waiting;
        a.assert(
          outcome.outcome === "present-invalidated",
          "dispose cancels the queued present",
        );
        a.assert(
          textureCount(handle) === 0 &&
            (hooks.resourceCounts().sceneFramebuffers ?? -1) === 0,
          "dispose releases every GPU resource",
        );
        a.assert(
          capture(() => hooks.readScene()) === "disposed",
          "the scene hook reports the disposed canvas",
        );
        a.assert(
          capture(() => context.fillText("x", 0, 0)) === "disposed",
          "text entry reports the disposed canvas",
        );
        a.assert(
          capture(() => {
            context.beginPath();
            context.rect(0, 0, 1, 1);
            context.clip();
          }) === "disposed",
          "clip entry reports the disposed canvas",
        );
        await task();
        a.assert(
          !handle.gl.isContextLost(),
          "dispose never loses the caller's context",
        );
        a.observe("queued", outcome.outcome);
        a.observe("textures", textureCount(handle));
        a.observe("contextAlive", !handle.gl.isContextLost());
      } finally {
        canvas.dispose();
      }
    },
  },
  {
    ...base,
    id: "ACC-05.resize-clears-assets-and-clip",
    requirements: ["CAN-04", "ACC-05", "context.clip"],
    async run(a) {
      const handle = await makeCompat(32, 32);
      const { context, canvas, hooks } = handle;
      try {
        await fillCaches(context);
        const before = hooks.readScene();
        a.assert(
          pixelsEqual(pixelAt(before, 2, 2), RED),
          "the cached text and clip drew before the resize",
        );
        const previousGeneration = before.generation;
        canvas.width = 32;
        const after = hooks.readScene();
        a.assert(
          after.generation > previousGeneration,
          "a same-size assignment rebuilds the scene",
        );
        a.assert(
          after.pixels.every((byte) => byte === 0),
          "the new scene is transparent",
        );
        // The clip and every cached asset belonged to the old generation; the
        // next draw must repaint the whole canvas instead of reusing them.
        context.fillStyle = "#00ff00";
        context.fillRect(0, 0, 32, 32);
        context.fillStyle = "#220000";
        context.font = "16px sans-serif";
        context.fillText("Ag", 2, 2);
        const redrawn = hooks.readScene();
        a.assert(
          pixelsEqual(pixelAt(redrawn, 30, 30), [0, 255, 0, 255]),
          "the old clip no longer constrains drawing",
        );
        a.assert(
          differing(redrawn, 0, 0, 16, 16, GREEN) > 0,
          "the text repaints over the new background",
        );
        a.assert(
          (hooks.resourceCounts().textureLeases ?? -1) === 0,
          "the rebuilt scene holds no stale upload lease",
        );
        a.observe("generation", [previousGeneration, redrawn.generation]);
      } finally {
        canvas.dispose();
      }
    },
  },
  {
    ...base,
    id: "ACC-05.loss-clears-assets",
    requirements: ["LIFE-02", "LIFE-03", "ACC-05"],
    async run(a) {
      let restored = 0;
      const handle = await makeCompat(32, 32, {
        onContextRestored: () => {
          restored += 1;
        },
      });
      const { context, canvas, hooks, target } = handle;
      try {
        await fillCaches(context);
        const generation = hooks.readScene().generation;
        target.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
        // Approved context-lost semantics: drawing is silently ineffective and
        // is never queued, matching native rather than reporting an error.
        const whileLost = capture(() => {
          context.fillStyle = "#0000ff";
          context.fillRect(0, 0, 32, 32);
        });
        a.assert(whileLost === "ok", "drawing while lost stays silent");
        a.assert(
          capture(() => hooks.readScene()) === "capability-unavailable",
          "the lost scene cannot be read",
        );
        target.dispatchEvent(new Event("webglcontextrestored"));
        a.assert(restored === 1, "the restore callback ran once");
        const restoredScene = hooks.readScene();
        a.assert(
          restoredScene.generation > generation,
          "restore advances the generation",
        );
        a.assert(
          restoredScene.pixels.every((byte) => byte === 0),
          "restore starts from a transparent scene",
        );
        // Text, path and clip assets are all dropped with the lost context.
        context.fillStyle = "#00ff00";
        context.fillRect(0, 0, 32, 32);
        context.fillStyle = "#220000";
        context.font = "16px sans-serif";
        context.fillText("Ag", 2, 2);
        const redrawn = hooks.readScene();
        a.assert(
          pixelsEqual(pixelAt(redrawn, 30, 30), [0, 255, 0, 255]),
          "the pre-loss clip is gone",
        );
        a.assert(
          differing(redrawn, 0, 0, 16, 16, GREEN) > 0,
          "the text repaints after restore",
        );
        a.observe("restoredCallbacks", restored);
        a.observe("cleared", true);
      } finally {
        canvas.dispose();
      }
    },
  },
  {
    ...base,
    id: "ACC-03.clear-clip-composite",
    requirements: [
      "ACC-03",
      "context.clearRect",
      "context.clip",
      "context.globalCompositeOperation",
      "context.filter",
      "context.globalAlpha",
    ],
    kind: "render",
    async run(a) {
      const context = a.context;
      // Opaque background, nested clips, then a clear that ignores paint and
      // composite but honors the clip.
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 32, 32);
      context.save();
      context.beginPath();
      context.rect(4, 4, 24, 24);
      context.clip();
      context.beginPath();
      context.rect(8, 8, 16, 16);
      context.clip();
      context.globalAlpha = 0.25;
      context.filter = "brightness(120%)";
      context.globalCompositeOperation = "source-in";
      context.clearRect(0, 0, 32, 32);
      context.restore();
      const scene = await dumpScene(a);
      for (const [x, y] of [
        [10, 10],
        [22, 22],
      ] as const)
        a.assert(
          pixelsEqual(scene.pixel(x, y), TRANSPARENT),
          `clearRect reaches the nested clip interior at ${x},${y}`,
        );
      for (const [x, y] of [
        [2, 2],
        [6, 6],
        [26, 26],
        [30, 30],
      ] as const)
        a.assert(
          pixelsEqual(scene.pixel(x, y), RED),
          `clearRect stays inside the nested clips at ${x},${y}`,
        );
      // After restore, the cleared region accepts new paint normally.
      context.fillStyle = "#0000ff";
      context.fillRect(10, 10, 4, 4);
      const after = await dumpScene(a);
      a.assert(
        pixelsEqual(after.pixel(11, 11), [0, 0, 255, 255]),
        "drawing works after the clipped clear",
      );
    },
  },
  {
    ...base,
    id: "ACC-04.external-source-order-clipped",
    requirements: ["ACC-04", "IMG-02", "context.drawImage", "context.clip"],
    kind: "render",
    async run(a) {
      const context = a.context;
      const source = document.createElement("canvas");
      source.width = 8;
      source.height = 8;
      const paintSource = (color: string): void => {
        const ctx = source.getContext("2d");
        if (!ctx) throw new Error("source context unavailable");
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 8, 8);
      };
      paintSource("#ff0000");
      context.beginPath();
      context.rect(0, 0, 24, 16);
      context.clip();
      Reflect.apply(context.drawImage, context, [source, 0, 0]);
      paintSource("#00ff00");
      Reflect.apply(context.drawImage, context, [source, 8, 0]);
      paintSource("#0000ff");
      Reflect.apply(context.drawImage, context, [source, 16, 0]);
      paintSource("#ffffff");
      const scene = await dumpScene(a);
      for (const [x, color] of [
        [4, [255, 0, 0, 255]],
        [12, [0, 255, 0, 255]],
        [20, [0, 0, 255, 255]],
      ] as const)
        a.assert(
          pixelsEqual(scene.pixel(x, 4), color),
          `each sample keeps its own time point at x=${x}`,
        );
      a.assert(
        pixelsEqual(scene.pixel(28, 4), TRANSPARENT),
        "the clip still bounds the third sample",
      );
      a.assert(
        pixelsEqual(scene.pixel(4, 20), TRANSPARENT),
        "the clip still bounds the source height",
      );
    },
  },
];
