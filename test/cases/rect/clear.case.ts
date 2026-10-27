import type { CaseDefinition } from "../../types/testing.js";
import { TRANSPARENT, dumpScene, pixelsEqual } from "./helpers.js";

const renderBase = {
  kind: "render" as const,
  width: 64,
  height: 64,
  seed: 1,
  fonts: [] as string[],
};

/**
 * clearRect: an independent clear that ignores paint, alpha and filter while
 * honoring the draw-time transform, plus its non-interference with the current
 * path. Exact-pixel assertions only cover deterministic geometry; antialiased
 * edges stay with the render pairs for review.
 */
export const cases: CaseDefinition[] = [
  {
    ...renderBase,
    id: "context.clearRect.render",
    requirements: ["context.clearRect", "context.fillRect"],
    display: {
      status: "included",
      observation: "红底上的清除孔及绿色块对部分孔洞的重填",
    },
    run(a) {
      const context = a.context;
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 64, 64);
      context.clearRect(12, 12, 24, 24);
      context.fillStyle = "#00ff00";
      context.fillRect(24, 24, 24, 24); // refills part of the hole
    },
  },
  {
    ...renderBase,
    id: "rect.clearRect.transform",
    requirements: [
      "context.clearRect",
      "context.fillRect",
      "context.rotate",
      "context.translate",
      "context.setTransform",
    ],
    display: {
      status: "included",
      observation: "旋转后的清除区域（菱形孔）及复位后的清除",
    },
    run(a) {
      const context = a.context;
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 64, 64);
      // The clear follows the draw-time transform: a rotated hole.
      context.translate(32, 32);
      context.rotate(Math.PI / 4);
      context.clearRect(-10, -10, 20, 20);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(48, 4, 16, 12);
    },
  },
  {
    ...renderBase,
    id: "rect.clearRect.state-independent",
    requirements: [
      "context.clearRect",
      "context.fillRect",
      "context.globalAlpha",
      "context.fillStyle",
    ],
    display: {
      status: "included",
      observation: "clearRect 忽略 alpha 与当前 paint 完全清除；清除后可重画",
    },
    kind: "combined",
    async run(a) {
      const context = a.context;
      context.fillStyle = "#0000ff";
      context.fillRect(0, 0, 64, 64);
      // Neither alpha nor the current paint may dilute the clear.
      context.globalAlpha = 0.25;
      context.fillStyle = "#ff0000";
      context.clearRect(16, 16, 32, 32);
      const cleared = await dumpScene(a);
      a.assert(
        pixelsEqual(cleared.pixel(20, 20), TRANSPARENT),
        "clearRect erases fully despite globalAlpha 0.25 and a red fillStyle",
      );
      a.assert(
        pixelsEqual(cleared.pixel(4, 4), [0, 0, 255, 255]),
        "outside the clear the fill is untouched",
      );
      context.globalAlpha = 1;
      context.fillStyle = "#00ff00";
      context.fillRect(20, 20, 8, 8);
      const refilled = await dumpScene(a);
      a.assert(
        pixelsEqual(refilled.pixel(22, 22), [0, 255, 0, 255]),
        "drawing into the cleared area works afterwards",
      );
      a.observe("clearIgnoresPaintAndAlpha", true);
    },
  },
  {
    ...renderBase,
    id: "rect.clearRect.full-canvas",
    requirements: ["context.clearRect", "context.fillRect", "canvas.width"],
    display: {
      status: "included",
      observation: "整画布 clearRect 后全透明；随后重画蓝块",
    },
    kind: "combined",
    width: 32,
    height: 32,
    async run(a) {
      const context = a.context;
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 32, 32);
      context.fillStyle = "#00ff00";
      context.fillRect(4, 4, 24, 24);
      // A clear spanning the whole canvas is a full reset of the pixels.
      context.clearRect(0, 0, a.canvas.width, a.canvas.height);
      const cleared = await dumpScene(a);
      a.assert(
        cleared.count((pixel) => pixel[3] !== 0) === 0,
        "canvas-sized clearRect leaves every pixel transparent",
      );
      context.fillStyle = "#0000ff";
      context.fillRect(8, 8, 8, 8);
      const redrawn = await dumpScene(a);
      a.assert(
        pixelsEqual(redrawn.pixel(10, 10), [0, 0, 255, 255]),
        "the canvas accepts new content after a full clear",
      );
      a.observe("clearedPixels", 0);
    },
  },
  {
    kind: "combined",
    width: 16,
    height: 16,
    seed: 1,
    fonts: [] as string[],
    id: "rect.clearRect.path-independence",
    requirements: [
      "context.clearRect",
      "context.beginPath",
      "context.rect",
      "context.fill",
    ],
    display: {
      status: "included",
      observation: "三个 rect 入口不干扰当前路径；fill 重画记录的矩形",
    },
    async run(a) {
      const context = a.context;
      // Record a current path, then run the three rect entries across it:
      // none of them may read or disturb it, on either side.
      context.beginPath();
      context.rect(2, 2, 8, 8);
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 8, 8);
      context.clearRect(6, 6, 4, 4);
      context.strokeStyle = "#0000ff";
      context.strokeRect(8, 8, 4, 4);
      context.fillStyle = "#00ff00";
      context.fill(); // fills the recorded rect if it survived untouched
      const scene = await dumpScene(a);
      a.assert(
        pixelsEqual(scene.pixel(1, 1), [255, 0, 0, 255]),
        "outside the recorded rect the fillRect survives",
      );
      a.assert(
        pixelsEqual(scene.pixel(5, 5), [0, 255, 0, 255]),
        "fill() repaints the recorded rect after fillRect and strokeRect",
      );
      a.assert(
        pixelsEqual(scene.pixel(7, 7), [0, 255, 0, 255]),
        "the area clearRect erased is refilled by the surviving path",
      );
      a.assert(
        pixelsEqual(scene.pixel(14, 14), TRANSPARENT),
        "nothing leaks beyond the recorded geometry",
      );
      a.observe("pathSurvives", true);
    },
  },
];
