import type { CaseDefinition } from "../../types/testing.js";
import { isCompat, outcome } from "../shared.js";
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
    requirements: ["context.clearRect", "context.fillRect", "context.rotate", "context.translate", "context.setTransform"],
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
    requirements: ["context.clearRect", "context.fillRect", "context.globalAlpha", "context.fillStyle"],
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
    kind: "semantic",
    width: 16,
    height: 16,
    seed: 1,
    fonts: [] as string[],
    id: "rect.clearRect.path-independence",
    requirements: ["context.clearRect", "context.beginPath", "context.rect", "context.fill"],
    run(a) {
      const context = a.context as unknown as Record<
        string,
        (...args: unknown[]) => unknown
      >;
      // Path survival itself stays pending: compat has no public path until
      // the path feature lands (#19), so asserting the stub codes would pass
      // the case without any path evidence. Both sides pin the pending seam;
      // the compat branch still exercises the stubs and reports through the
      // as-approved observation, which trips the cross-side comparison if the
      // stub codes ever change.
      let pathMembers = "as-approved";
      if (isCompat(a)) {
        const codes = [
          outcome(() => context.beginPath!()),
          outcome(() => context.rect!(1, 1, 4, 4)),
          outcome(() => context.fill!()),
        ];
        if (!codes.every((code) => code === "not-implemented"))
          pathMembers = codes.join(",");
        a.context.fillStyle = "#ff0000";
        a.context.fillRect(0, 0, 8, 8);
        a.context.clearRect(2, 2, 4, 4);
        a.context.strokeRect(4, 4, 8, 8);
      } else {
        const native = a.context as CanvasRenderingContext2D;
        native.beginPath();
        native.rect(2, 2, 4, 4);
        native.fillStyle = "#ff0000";
        native.fillRect(0, 0, 8, 8);
        native.clearRect(6, 6, 4, 4);
        native.strokeRect(8, 8, 4, 4);
        native.fillStyle = "#00ff00";
        native.fill();
      }
      a.observe("pathMembers", pathMembers);
      a.observe("pathSurvives", "pending-#19");
    },
  },
];
