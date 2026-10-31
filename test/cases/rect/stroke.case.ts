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
 * strokeRect rendering through its native primitive asset service; joins and
 * line-width scaling of the draw-time transform match the reference rasterizer.
 */
export const cases: CaseDefinition[] = [
  {
    ...renderBase,
    kind: "semantic",
    width: 16,
    height: 16,
    id: "rect.strokeRect.small-corners",
    requirements: ["context.strokeRect", "context.lineWidth"],
    async run(a) {
      a.context.strokeStyle = "#0000ff";
      a.context.strokeRect(8, 8, 4, 4);
      const scene = await dumpScene(a);
      for (const [x, y] of [
        [7, 7],
        [12, 7],
        [7, 12],
        [12, 12],
      ] as const) {
        const pixel = scene.pixel(x, y);
        a.assert(
          pixel[2] > 0 && pixel[3] > 0,
          `small strokeRect preserves corner (${x},${y})`,
        );
      }
      a.assert(
        scene.pixel(10, 10)[3] === 0,
        "small strokeRect keeps its interior hollow",
      );
      a.observe("all-corners-present", true);
    },
  },
  {
    ...renderBase,
    id: "context.strokeRect.render",
    requirements: ["context.strokeRect", "context.lineWidth"],
    display: {
      status: "included",
      observation: "1px 半像素描边清晰、4px miter 角及多色矩形描边",
    },
    run(a) {
      const context = a.context;
      // A 1px stroke at half-pixel origin lands crisp; the 4px stroke miters.
      context.strokeStyle = "#ff0000";
      context.strokeRect(4.5, 4.5, 23, 23);
      context.lineWidth = 4;
      context.strokeStyle = "#00ff00";
      context.strokeRect(32, 32, 24, 24);
      context.lineWidth = 2;
      context.strokeStyle = "#0000ff";
      context.strokeRect(40, 4, 16, 16);
    },
  },
  {
    ...renderBase,
    id: "rect.strokeRect.transform",
    requirements: [
      "context.strokeRect",
      "context.rotate",
      "context.translate",
      "context.setTransform",
      "context.lineWidth",
    ],
    display: {
      status: "included",
      observation: "旋转变换描边与各向异性缩放下线宽拉伸",
    },
    run(a) {
      const context = a.context;
      context.lineWidth = 2;
      context.strokeStyle = "#ff0000";
      context.translate(32, 32);
      context.rotate(Math.PI / 6);
      context.strokeRect(-12, -12, 24, 24);
      // Anisotropic scale stretches the stroke width with the transform.
      context.setTransform(2, 0, 0, 1, 0, 0);
      context.lineWidth = 3;
      context.strokeStyle = "#00ff00";
      context.strokeRect(4, 36, 12, 12);
    },
  },
  {
    ...renderBase,
    id: "rect.strokeRect.negative-size",
    requirements: ["context.strokeRect", "context.lineWidth"],
    display: {
      status: "included",
      observation: "负宽/高 strokeRect 的落点",
    },
    run(a) {
      const context = a.context;
      context.lineWidth = 3;
      context.strokeStyle = "#ff0000";
      context.strokeRect(40, 40, -24, -16);
      context.strokeStyle = "#00ff00";
      context.strokeRect(52, 8, -12, 12);
      context.strokeStyle = "#0000ff";
      context.strokeRect(12, 56, 16, -12);
    },
  },
  {
    ...renderBase,
    id: "rect.strokeRect.degenerate",
    requirements: ["context.strokeRect", "context.lineWidth"],
    display: {
      status: "included",
      observation: "单零尺寸描出直线；双零尺寸不绘制",
    },
    kind: "combined",
    async run(a) {
      const context = a.context;
      context.lineWidth = 2;
      // Exactly one zero extent strokes a line; both zero paints nothing.
      context.strokeStyle = "#ff0000";
      context.strokeRect(8, 16, 32, 0);
      context.strokeStyle = "#00ff00";
      context.strokeRect(48, 24, 0, 24);
      context.strokeStyle = "#0000ff";
      context.strokeRect(56, 56, 0, 0);
      const scene = await dumpScene(a);
      a.assert(
        pixelsEqual(scene.pixel(20, 15), [255, 0, 0, 255]) &&
          pixelsEqual(scene.pixel(20, 16), [255, 0, 0, 255]),
        "zero-height strokeRect strokes a horizontal line",
      );
      a.assert(
        pixelsEqual(scene.pixel(47, 30), [0, 255, 0, 255]) &&
          pixelsEqual(scene.pixel(48, 30), [0, 255, 0, 255]),
        "zero-width strokeRect strokes a vertical line",
      );
      a.assert(
        pixelsEqual(scene.pixel(56, 56), TRANSPARENT) &&
          pixelsEqual(scene.pixel(55, 56), TRANSPARENT) &&
          pixelsEqual(scene.pixel(56, 55), TRANSPARENT),
        "zero-zero strokeRect paints nothing",
      );
      a.observe("linesStroked", true);
    },
  },
  {
    ...renderBase,
    id: "rect.strokeRect.alpha-overlap",
    requirements: [
      "context.strokeRect",
      "context.fillRect",
      "context.globalAlpha",
      "context.lineWidth",
    ],
    display: {
      status: "included",
      observation: "蓝底上半透明描边的叠加混合",
    },
    run(a) {
      const context = a.context;
      context.fillStyle = "#0000ff";
      context.fillRect(0, 0, 64, 64);
      context.globalAlpha = 0.5;
      context.lineWidth = 6;
      context.strokeStyle = "#ff0000";
      context.strokeRect(12, 12, 40, 40);
      context.globalAlpha = 1;
      context.lineWidth = 2;
      context.strokeStyle = "rgba(0, 255, 0, 0.5)";
      context.strokeRect(24, 24, 32, 32);
    },
  },
];
