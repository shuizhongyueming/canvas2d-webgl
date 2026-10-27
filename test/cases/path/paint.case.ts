import type { CaseDefinition } from "../../types/testing.js";
import { STRIPES_3x5, dumpScene, loadImage, pixelsEqual } from "./helpers.js";

const renderBase = {
  kind: "render" as const,
  width: 64,
  height: 64,
  seed: 1,
  fonts: [] as string[],
};

/**
 * Path fills and strokes consume every approved paint: solids, linear
 * gradients and repeat patterns, evaluated in the draw-time coordinate space.
 * The stop-mutation case pins cache invalidation: re-filling the SAME recorded
 * path after addColorStop must not serve the stale rasterized asset.
 */
export const cases: CaseDefinition[] = [
  {
    ...renderBase,
    id: "path.fill.paint-gradient",
    requirements: [
      "context.fill",
      "context.createLinearGradient",
      "context.fillStyle",
      "context.rect",
      "context.translate",
      "context.setTransform",
    ],
    display: {
      status: "included",
      observation: "渐变填充路径；平移后渐变随几何移动",
    },
    run(a) {
      const context = a.context;
      const ramp = context.createLinearGradient(0, 0, 32, 0);
      ramp.addColorStop(0, "#ff0000");
      ramp.addColorStop(1, "#0000ff");
      context.fillStyle = ramp;
      context.beginPath();
      context.rect(4, 4, 32, 24);
      context.moveTo(40, 40);
      context.lineTo(60, 40);
      context.lineTo(50, 60);
      context.closePath();
      context.fill();
      // The ramp is interpreted in the draw-time space: translating moves the
      // gradient with the geometry, exactly like the rect entry points.
      context.translate(8, 32);
      context.beginPath();
      context.rect(0, 0, 32, 8);
      context.fill();
      context.setTransform(1, 0, 0, 1, 0, 0);
    },
  },
  {
    ...renderBase,
    id: "path.fill.paint-pattern",
    requirements: [
      "context.fill",
      "context.createPattern",
      "context.fillStyle",
      "context.rect",
      "context.translate",
      "context.setTransform",
    ],
    display: {
      status: "included",
      observation: "图案填充路径的形状与相位",
    },
    async run(a) {
      const context = a.context;
      const pattern = context.createPattern(
        await loadImage(STRIPES_3x5),
        "repeat",
      );
      a.assert(pattern !== null, "repeat pattern created");
      if (!pattern) throw new Error("repeat pattern unavailable");
      context.fillStyle = pattern;
      context.beginPath();
      context.rect(4, 4, 24, 24);
      context.moveTo(36, 36);
      context.lineTo(60, 36);
      context.lineTo(48, 60);
      context.closePath();
      context.fill();
      // Tile phase follows the draw-time transform (NPOT through fract()).
      context.translate(13, 40);
      context.beginPath();
      context.rect(0, 0, 18, 12);
      context.fill();
      context.setTransform(1, 0, 0, 1, 0, 0);
    },
  },
  {
    ...renderBase,
    id: "path.stroke.paint-gradient",
    requirements: [
      "context.stroke",
      "context.createLinearGradient",
      "context.strokeStyle",
      "context.moveTo",
      "context.lineTo",
      "context.lineWidth",
    ],
    display: {
      status: "included",
      observation: "渐变描边路径的外观",
    },
    run(a) {
      const context = a.context;
      const ramp = context.createLinearGradient(0, 0, 64, 0);
      ramp.addColorStop(0, "#ff0000");
      ramp.addColorStop(0.5, "#00ff00");
      ramp.addColorStop(1, "#0000ff");
      context.strokeStyle = ramp;
      context.lineWidth = 6;
      context.beginPath();
      context.moveTo(4, 12);
      context.lineTo(60, 12);
      context.stroke();
      context.lineWidth = 10;
      context.beginPath();
      context.moveTo(8, 32);
      context.lineTo(32, 52);
      context.lineTo(56, 32);
      context.stroke();
    },
  },
  {
    ...renderBase,
    id: "path.stroke.paint-pattern",
    requirements: [
      "context.stroke",
      "context.createPattern",
      "context.strokeStyle",
      "context.rect",
      "context.lineWidth",
    ],
    display: {
      status: "included",
      observation: "图案描边路径的外观",
    },
    async run(a) {
      const context = a.context;
      const pattern = context.createPattern(
        await loadImage(STRIPES_3x5),
        "repeat",
      );
      a.assert(pattern !== null, "repeat pattern created");
      if (!pattern) throw new Error("repeat pattern unavailable");
      context.strokeStyle = pattern;
      context.lineWidth = 5;
      context.beginPath();
      context.rect(8, 8, 32, 24);
      context.stroke();
      context.lineWidth = 8;
      context.beginPath();
      context.moveTo(8, 52);
      context.lineTo(56, 44);
      context.stroke();
    },
  },
  ...(["fill", "stroke"] as const).map(
    (mode): CaseDefinition => ({
      ...renderBase,
      id: `path.paint.gradient-stop-mutation-${mode}`,
      requirements: [
        `context.${mode}`,
        "context.createLinearGradient",
        "gradient.addColorStop",
        "context.rect",
      ],
      kind: "combined",
      display: {
        status: "included",
        observation: "渐变 stop 修改后同一记录路径的 fill/stroke 重栅格为蓝色",
      },
      async run(a) {
        const context = a.context;
        const ramp = context.createLinearGradient(0, 0, 32, 0);
        ramp.addColorStop(0, "#ff0000");
        ramp.addColorStop(1, "#ff0000");
        context.fillStyle = ramp;
        context.strokeStyle = ramp;
        context.lineWidth = 4;
        context.beginPath();
        context.rect(4, 4, 24, 24);
        context[mode]();
        const before = await dumpScene(a);
        a.assert(
          pixelsEqual(before.pixel(5, 16), [255, 0, 0, 255]),
          "initial paint is red",
        );
        ramp.addColorStop(0.01, "#0000ff");
        ramp.addColorStop(0.99, "#0000ff");
        context[mode]();
        const after = await dumpScene(a);
        a.assert(
          pixelsEqual(after.pixel(5, 16), [0, 0, 255, 255]),
          "mutating stops invalidates the retained path asset",
        );
        a.observe("mutatedPixels", [after.pixel(5, 16), after.pixel(26, 16)]);
      },
    }),
  ),
  ...(["gradient", "pattern"] as const).map(
    (paint): CaseDefinition => ({
      ...renderBase,
      id: `rect.strokeRect.paint-${paint}`,
      requirements: [
        "context.strokeRect",
        "context.strokeStyle",
        "context.createLinearGradient",
        "context.createPattern",
      ],
      display: {
        status: "included",
        observation: "渐变/图案描边 strokeRect 及旋转变换下的接缝",
      },
      async run(a) {
        const context = a.context;
        if (paint === "gradient") {
          const ramp = context.createLinearGradient(0, 0, 64, 0);
          ramp.addColorStop(0, "#ff0000");
          ramp.addColorStop(1, "#0000ff");
          context.strokeStyle = ramp;
        } else {
          const pattern = context.createPattern(
            await loadImage(STRIPES_3x5),
            "repeat",
          );
          if (!pattern) throw new Error("repeat pattern unavailable");
          context.strokeStyle = pattern;
        }
        context.lineWidth = 6;
        context.strokeRect(8, 8, 40, 24);
        context.translate(32, 44);
        context.rotate(Math.PI / 8);
        context.strokeRect(-12, -8, 24, 16);
      },
    }),
  ),
  {
    ...renderBase,
    id: "rect.paint.gradient-stop-mutation",
    requirements: [
      "context.fillRect",
      "context.strokeRect",
      "context.createLinearGradient",
      "gradient.addColorStop",
    ],
    display: {
      status: "included",
      observation: "渐变 stop 修改后 fillRect/strokeRect 重栅格为新色带",
    },
    kind: "combined",
    async run(a) {
      const context = a.context;
      const ramp = context.createLinearGradient(0, 0, 64, 0);
      ramp.addColorStop(0, "#ff0000");
      ramp.addColorStop(1, "#ff0000");
      context.fillStyle = ramp;
      context.strokeStyle = ramp;
      context.lineWidth = 4;
      context.fillRect(4, 4, 20, 20);
      context.strokeRect(36, 4, 20, 20);
      const before = await dumpScene(a);
      a.assert(
        pixelsEqual(before.pixel(8, 8), [255, 0, 0, 255]),
        "initial rect fill is red",
      );
      a.assert(
        pixelsEqual(before.pixel(36, 12), [255, 0, 0, 255]),
        "initial rect stroke is red",
      );
      ramp.addColorStop(0.01, "#0000ff");
      ramp.addColorStop(0.99, "#0000ff");
      context.fillRect(4, 4, 20, 20);
      context.strokeRect(36, 4, 20, 20);
      const after = await dumpScene(a);
      a.assert(
        pixelsEqual(after.pixel(8, 8), [0, 0, 255, 255]),
        "rect fill consumes updated stops",
      );
      a.assert(
        pixelsEqual(after.pixel(36, 12), [0, 0, 255, 255]),
        "rect stroke consumes updated stops",
      );
    },
  },
];
