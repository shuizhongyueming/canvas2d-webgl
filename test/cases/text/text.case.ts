import type { CaseDefinition } from "../../types/testing.js";
import { dumpScene } from "./helpers.js";

/**
 * Text drawing edge behavior that needs real pixels or measurements rather
 * than a render pair: empty strings are strict no-ops, and font changes
 * invalidate cached measurements/assets.
 */
export const cases: CaseDefinition[] = [
  {
    id: "text.empty-string",
    requirements: ["context.fillText", "context.strokeText"],
    kind: "combined",
    width: 32,
    height: 32,
    seed: 1,
    fonts: ["24px sans-serif"],
    async run(a) {
      const context = a.context;
      context.font = "24px sans-serif";
      context.fillStyle = "#cc1a33";
      context.fillText("", 8, 24);
      context.strokeStyle = "#1a40bf";
      context.lineWidth = 3;
      context.strokeText("", 8, 24);
      const scene = await dumpScene(a);
      a.assert(
        scene.count(([, , , alpha]) => alpha !== 0) === 0,
        "empty strings paint no pixels",
      );
      context.fillText("Real", 2, 28);
      const after = await dumpScene(a);
      a.assert(
        after.count(([, , , alpha]) => alpha !== 0) > 0,
        "real text lands after the empty draws",
      );
      a.observe(
        "emptyInkCount",
        scene.count(([, , , alpha]) => alpha !== 0),
      );
    },
  },
  {
    id: "text.font-cache",
    requirements: ["context.font", "context.measureText", "metrics.width"],
    kind: "semantic",
    width: 16,
    height: 16,
    seed: 1,
    fonts: ["12px monospace", "24px sans-serif"],
    run(a) {
      const c = a.context;
      c.font = "12px monospace";
      const before = c.measureText("Cache").width;
      const repeat = c.measureText("Cache").width;
      c.font = "24px sans-serif";
      const changed = c.measureText("Cache").width;
      c.font = "12px monospace";
      const restored = c.measureText("Cache").width;
      a.assert(repeat === before, "repeated measurement is stable");
      a.assert(changed > before, "a font change invalidates the measurement");
      a.assert(restored === before, "restoring the font restores the width");
      a.observe("widths", [before, repeat, changed, restored]);
    },
  },
];
