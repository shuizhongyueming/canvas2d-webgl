import type { CaseDefinition } from "../../types/testing.js";
import { loadImage, STRIPES_3x5 } from "../paint/fixtures.js";
import { isCompat, outcome } from "../shared.js";
import { TRANSPARENT, dumpScene, pixelsEqual } from "./helpers.js";

const assignStroke = (context: unknown, value: unknown): void => {
  (context as unknown as Record<string, unknown>).strokeStyle = value;
};

const renderBase = {
  kind: "render" as const,
  width: 64,
  height: 64,
  seed: 1,
  fonts: [] as string[],
};

/**
 * Rect/paint seams recorded as follow-ups from the #17 review: strokeRect
 * with gradient and pattern strokes (both go through the native stroke asset
 * service), and the whole-surface source-in semantics of a non-solid
 * fillRect. The composite implementation belongs to #22; until it lands, the
 * source-in case pins native truth on the reference side and the
 * not-implemented seam on the compat side.
 */
export const cases: CaseDefinition[] = [
  {
    ...renderBase,
    id: "rect.strokeRect.gradient-stroke",
    requirements: [
      "context.strokeRect",
      "context.strokeStyle",
      "context.createLinearGradient",
      "context.lineWidth",
    ],
    run(a) {
      const context = a.context;
      context.lineWidth = 3;
      const gradient = context.createLinearGradient(0, 0, 64, 0);
      gradient.addColorStop(0, "#ff0000");
      gradient.addColorStop(1, "#0000ff");
      assignStroke(context, gradient);
      context.strokeRect(8, 8, 32, 32);
      // The stroke paint is evaluated in the draw-time space: the rotated
      // rect sees a rotated ramp.
      context.lineWidth = 2;
      context.translate(48, 48);
      context.rotate(Math.PI / 6);
      context.strokeRect(-10, -10, 20, 20);
    },
  },
  {
    ...renderBase,
    id: "rect.strokeRect.pattern-stroke",
    requirements: [
      "context.strokeRect",
      "context.strokeStyle",
      "context.createPattern",
    ],
    async run(a) {
      const context = a.context;
      const pattern = context.createPattern(
        await loadImage(STRIPES_3x5),
        "repeat",
      );
      a.assert(pattern !== null, "repeat pattern created for the stroke");
      context.lineWidth = 4;
      assignStroke(context, pattern);
      context.strokeRect(6, 6, 28, 28);
      // Anisotropic draw-time transform scales both the rect and the tile.
      context.lineWidth = 2;
      context.setTransform(2, 0, 0, 1.5, 0, 0);
      context.strokeRect(20, 32, 20, 20);
    },
  },
  {
    id: "rect.fillRect.source-in-outside-source",
    requirements: [
      "context.fillRect",
      "context.globalCompositeOperation",
      "ACC-03",
    ],
    kind: "semantic",
    width: 32,
    height: 32,
    seed: 1,
    fonts: [] as string[],
    async run(a) {
      const context = a.context;
      let composite = "as-approved";
      if (isCompat(a)) {
        // The composite ticket (#22) owns globalCompositeOperation; until it
        // lands the setter reports not-implemented and this draw stays
        // source-over. Pin the seam instead of asserting fake evidence.
        const code = outcome(() => {
          (
            context as unknown as { globalCompositeOperation: unknown }
          ).globalCompositeOperation = "source-in";
        });
        if (code !== "not-implemented") composite = code;
        context.fillStyle = "#00ff00";
        context.fillRect(0, 0, 32, 32);
        const gradient = context.createLinearGradient(0, 0, 32, 0);
        gradient.addColorStop(0, "#ff0000");
        gradient.addColorStop(1, "#0000ff");
        context.fillStyle = gradient;
        context.fillRect(8, 8, 16, 16);
        const scene = await dumpScene(a);
        a.assert(
          code === "not-implemented" &&
            pixelsEqual(scene.pixel(4, 4), [0, 255, 0, 255]),
          "destination outside the source matches the recorded composite status",
        );
        const inside = scene.pixel(16, 16);
        a.assert(
          inside[0] > 100 && inside[2] > 60 && inside[3] === 255,
          "the gradient covers the source interior",
        );
      } else {
        const native = context;
        native.fillStyle = "#00ff00";
        native.fillRect(0, 0, 32, 32);
        native.globalCompositeOperation = "source-in";
        const gradient = native.createLinearGradient(0, 0, 32, 0);
        gradient.addColorStop(0, "#ff0000");
        gradient.addColorStop(1, "#0000ff");
        native.fillStyle = gradient;
        native.fillRect(8, 8, 16, 16);
        // Native truth: source-in erases the destination everywhere the
        // source does not cover — across the whole effective clip, not just
        // the source bounds (ACC-03).
        const scene = await dumpScene(a);
        a.assert(
          pixelsEqual(scene.pixel(4, 4), TRANSPARENT),
          "destination outside the source matches the recorded composite status",
        );
        const inside = scene.pixel(16, 16);
        a.assert(
          inside[0] > 100 && inside[2] > 60 && inside[3] === 255,
          "the gradient covers the source interior",
        );
      }
      a.observe("composite", composite);
      a.observe("sourceInOutsideSource", "pending-#22");
    },
  },
];
