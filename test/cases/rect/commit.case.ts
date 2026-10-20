import type { CaseDefinition } from "../../types/testing.js";
import { isCompat, outcome } from "../shared.js";
import { displayPixel, dumpScene, hooksOf, pixelsEqual } from "./helpers.js";

const base = {
  kind: "combined" as const,
  width: 32,
  height: 32,
  seed: 1,
  fonts: [] as string[],
};

/**
 * Commit semantics for the rect entry points: scene writes are synchronous,
 * presents coalesce per task and land at the microtask checkpoint, content
 * survives across frames, and a same-size assignment performs the full
 * CAN-04 reset. Scene pixels are asserted on both sides (hook on compat,
 * getImageData on native); display visibility is evidenced by the harness
 * display artifacts of the render cases.
 */
export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "CAN-05.microtask-order",
    requirements: ["CAN-05", "context.fillRect"],
    async run(a) {
      const context = a.context;
      const hooks = await hooksOf(a);
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 16, 32);
      // The draw reaches the scene synchronously, before any present.
      const sync = await dumpScene(a);
      a.assert(
        pixelsEqual(sync.pixel(8, 16), [255, 0, 0, 255]),
        "the scene carries a draw before the microtask checkpoint",
      );
      let burstCoalesced = true;
      let appendGotOwnPresent = true;
      if (hooks) {
        // Record<string, number> indexing is optional under noUncheckedIndexedAccess.
        const presentsOf = () => hooks.resourceCounts().presents ?? -1;
        const before = presentsOf();
        context.fillStyle = "#00ff00";
        context.fillRect(2, 2, 4, 4);
        context.fillRect(6, 6, 4, 4);
        const generation = hooks.readScene().generation;
        await hooks.whenPresented(generation);
        burstCoalesced = presentsOf() === before + 1;
        // A promise-appended draw misses this task's checkpoint and presents
        // on its own: the count advances once more, not zero or two.
        await Promise.resolve().then(() => {
          context.fillStyle = "#0000ff";
          context.fillRect(16, 0, 16, 32);
        });
        await hooks.whenPresented(generation);
        appendGotOwnPresent = presentsOf() === before + 2;
      } else {
        context.fillStyle = "#00ff00";
        context.fillRect(2, 2, 4, 4);
        context.fillRect(6, 6, 4, 4);
        await Promise.resolve().then(() => {
          context.fillStyle = "#0000ff";
          context.fillRect(16, 0, 16, 32);
        });
      }
      a.assert(burstCoalesced, "same-task draws coalesce into one present");
      a.assert(
        appendGotOwnPresent,
        "a microtask-appended draw presents after the current checkpoint",
      );
      const end = await dumpScene(a);
      a.assert(
        pixelsEqual(end.pixel(8, 16), [255, 0, 0, 255]) &&
          pixelsEqual(end.pixel(4, 4), [0, 255, 0, 255]) &&
          pixelsEqual(end.pixel(24, 16), [0, 0, 255, 255]),
        "draws before and after the microtask both persist",
      );
      a.observe("order", "sync-burst-then-microtask-append");
    },
  },
  {
    ...base,
    id: "CAN-05.display-target",
    requirements: ["CAN-05", "context.fillRect"],
    kind: "render",
    width: 64,
    height: 64,
    async run(a) {
      const context = a.context;
      // Take the hooks before drawing: the hook lookup crosses the compiler
      // boundary and its await must not consume the microtask window in which
      // the present lands, or the unpreserved drawing buffer is cleared
      // before the display read.
      const hooks = await hooksOf(a);
      // Asymmetric markers: a flipped or swapped present is caught both by the
      // in-case display probe and by the review of the display artifacts.
      context.fillStyle = "#ff0000";
      context.fillRect(4, 4, 24, 24); // top-left
      context.fillStyle = "#00ff00";
      context.fillRect(40, 40, 20, 20); // bottom-right
      if (hooks) {
        // Read the display surface in the microtask right after the present,
        // before the next composite can clear the unpreserved drawing buffer.
        const { generation } = hooks.readScene();
        await hooks.whenPresented(generation);
      }
      a.assert(
        pixelsEqual(await displayPixel(a, 8, 8), [255, 0, 0, 255]),
        "display surface shows the top-left marker, unflipped",
      );
      a.assert(
        pixelsEqual(await displayPixel(a, 50, 50), [0, 255, 0, 255]),
        "display surface shows the bottom-right marker, unflipped",
      );
      // The first frame stays visible across the rAF boundary; the second
      // frame adds to it (retention on the display target, not just in the FBO).
      await a.checkpoint();
      context.fillStyle = "#0000ff";
      context.fillRect(40, 4, 20, 20); // top-right joins in frame two
    },
  },
  {
    ...base,
    id: "rect.frame-persistence",
    requirements: ["CAN-05", "context.fillRect"],
    async run(a) {
      const context = a.context;
      context.fillStyle = "#ff0000";
      context.fillRect(4, 4, 8, 8);
      await a.checkpoint();
      const mid = await dumpScene(a);
      a.assert(
        pixelsEqual(mid.pixel(6, 6), [255, 0, 0, 255]),
        "frame one content persists across the frame boundary",
      );
      context.fillStyle = "#00ff00";
      context.fillRect(20, 20, 8, 8);
      await a.checkpoint();
      const end = await dumpScene(a);
      a.assert(
        pixelsEqual(end.pixel(6, 6), [255, 0, 0, 255]) &&
          pixelsEqual(end.pixel(22, 22), [0, 255, 0, 255]),
        "both frames' draws coexist without any explicit flush",
      );
      a.observe("persisted", true);
    },
  },
  {
    ...base,
    id: "CAN-04.same-size-reset",
    requirements: ["CAN-04", "canvas.width", "context.fillRect"],
    width: 16,
    height: 16,
    async run(a) {
      const context = a.context;
      context.fillStyle = "#ff0000";
      context.fillRect(2, 2, 12, 12);
      context.globalAlpha = 0.5;
      // Path bookkeeping before the reset: real on native, still pending on
      // compat (the path feature owns it).
      let pathRecording = "as-approved";
      if (isCompat(a)) {
        const attempt = outcome(() =>
          (context as unknown as { beginPath(): unknown }).beginPath(),
        );
        if (attempt !== "not-implemented") pathRecording = attempt;
      } else {
        const native = context as CanvasRenderingContext2D;
        native.beginPath();
        native.rect(4, 4, 8, 8);
      }
      a.canvas.width = 16; // Assigning the same value is a full reset (CAN-04).
      const cleared = await dumpScene(a);
      a.assert(
        cleared.count((pixel) => pixel[3] !== 0) === 0,
        "same-size assignment clears the bitmap",
      );
      a.assert(context.globalAlpha === 1, "drawing state resets");
      // Path reset is owned by the path feature: there is no public path on
      // compat yet, so the reset of the current path stays pending instead of
      // asserting hardcoded evidence. Tracked by #19.
      a.observe("pathReset", "pending-#19");
      context.fillStyle = "#0000ff";
      context.fillRect(4, 4, 4, 4);
      await a.checkpoint();
      const redrawn = await dumpScene(a);
      a.assert(
        pixelsEqual(redrawn.pixel(5, 5), [0, 0, 255, 255]),
        "the canvas stays drawable after a same-size reset",
      );
      a.observe("pathRecording", pathRecording);
      a.observe("resetSemantics", "cleared+state");
    },
  },
];
