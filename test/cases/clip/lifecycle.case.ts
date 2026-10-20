import type { CaseDefinition } from "../../types/testing.js";
import {
  BLUE,
  GREEN,
  RED,
  capture,
  countPixels,
  drawHarnessMarker,
  makeCompat,
  pixelAt,
  pixelsEqual,
} from "../lifecycle/helpers.js";

const base = {
  kind: "combined" as const,
  width: 32,
  height: 32,
  seed: 1,
  fonts: [] as string[],
};

function lostEvent(): Event {
  return new Event("webglcontextlost", { cancelable: true });
}

function restoredEvent(): Event {
  return new Event("webglcontextrestored");
}

export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "clip.lifecycle-restore-discards-clip",
    requirements: ["context.clip", "LIFE-03", "ACC-03"],
    async run(a) {
      // The harness canvas keeps the captured pair non-vacuous; the library
      // canvas below owns the loss/restore sequence.
      drawHarnessMarker(a);
      let lost = 0;
      let restored = 0;
      const handle = await makeCompat(32, 32, {
        onContextLost: () => {
          lost += 1;
        },
        onContextRestored: () => {
          restored += 1;
        },
      });
      const { context, canvas, hooks, target } = handle;
      try {
        context.fillStyle = "#0000ff";
        context.fillRect(0, 0, 32, 32);
        // Clip A, save it on the stack, then intersect with clip B.
        context.beginPath();
        context.rect(4, 4, 8, 8);
        context.clip();
        context.save();
        context.beginPath();
        context.rect(8, 8, 16, 16);
        context.clip();
        context.fillStyle = "#ff0000";
        context.fillRect(0, 0, 32, 32);

        const clipped = hooks.readScene();
        a.assert(
          pixelsEqual(pixelAt(clipped, 9, 9), RED),
          "the nested clip is effective before loss",
        );
        a.assert(
          pixelsEqual(pixelAt(clipped, 5, 5), BLUE),
          "clip B excludes the rest of clip A",
        );
        a.assert(
          pixelsEqual(pixelAt(clipped, 2, 2), BLUE),
          "clip A excludes the canvas corner",
        );

        target.dispatchEvent(lostEvent());
        a.assert(lost === 1, "the loss callback ran once");
        context.fillStyle = "#00ff00";
        context.fillRect(0, 0, 32, 32);
        a.assert(
          capture(() => hooks.readScene()) === "capability-unavailable",
          "the lost scene is not readable",
        );

        target.dispatchEvent(restoredEvent());
        a.assert(restored === 1, "the restore callback ran once");
        const cleared = hooks.readScene();
        a.assert(
          countPixels(cleared, (pixel) => pixel[3] !== 0) === 0,
          "restore starts from a cleared scene",
        );

        // The stack still holds the pre-loss save entry. Restoring it must not
        // resurrect clip A: the session discarded saved clips before the
        // feature lifecycle hooks ran.
        context.restore();
        context.fillStyle = "#00ff00";
        context.fillRect(0, 0, 32, 32);
        const after = hooks.readScene();
        a.assert(
          pixelsEqual(pixelAt(after, 1, 1), GREEN),
          "a saved clip does not survive restore",
        );
        a.assert(
          pixelsEqual(pixelAt(after, 30, 30), GREEN),
          "the current clip does not survive restore",
        );
        a.observe("callbacks", [lost, restored]);
        a.observe("clearedAfterRestore", true);
      } finally {
        canvas.dispose();
      }
    },
  },
];
