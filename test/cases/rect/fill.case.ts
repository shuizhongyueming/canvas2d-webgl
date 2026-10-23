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
 * fillRect rendering: integer, sub-pixel, transformed, mirrored, negative and
 * degenerate geometry plus translucent overlap. Solid fills are direct GPU
 * quads on compat; render pairs (scene and display) go to human+AI review.
 */
export const cases: CaseDefinition[] = [
  {
    ...renderBase,
    id: "context.fillRect.render",
    requirements: ["context.fillRect"],
    display: {
      status: "included",
      observation: "基础 fillRect 的颜色与位置",
    },
    run(a) {
      const context = a.context;
      context.fillStyle = "#ff0000";
      context.fillRect(4, 4, 32, 24);
      context.fillStyle = "#00ff00";
      context.fillRect(20, 16, 32, 32); // overlaps the red rect
      context.fillStyle = "#0000ff";
      context.fillRect(48, 48, 8, 8);
    },
  },
  {
    ...renderBase,
    id: "rect.fillRect.subpixel",
    requirements: ["context.fillRect"],
    display: {
      status: "included",
      observation: "小数坐标 fillRect 的抗锯齿边缘",
    },
    run(a) {
      const context = a.context;
      // Fractional origins and sizes exercise antialiased edges.
      context.fillStyle = "#ff0000";
      context.fillRect(4.5, 4.5, 19, 19);
      context.fillStyle = "#00ff00";
      context.fillRect(32.25, 8.75, 15.5, 12.25);
      context.fillStyle = "#0000ff";
      context.fillRect(10.5, 32.5, 30.25, 20.75);
    },
  },
  {
    ...renderBase,
    id: "rect.fillRect.transform",
    requirements: [
      "context.fillRect",
      "context.translate",
      "context.rotate",
      "context.scale",
      "context.setTransform",
    ],
    display: {
      status: "included",
      observation: "旋转/缩放变换下 fillRect 的形状与位置",
    },
    run(a) {
      const context = a.context;
      context.fillStyle = "#ff0000";
      context.translate(32, 32);
      context.rotate(Math.PI / 6);
      context.fillRect(-12, -12, 24, 24);
      context.setTransform(2, 0, 0, 0.5, 4, 44);
      context.fillStyle = "#00ff00";
      context.fillRect(4, 4, 12, 16);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = "#0000ff";
      context.fillRect(52, 4, 8, 8);
    },
  },
  {
    ...renderBase,
    id: "rect.fillRect.mirror",
    requirements: ["context.fillRect", "context.scale"],
    display: {
      status: "included",
      observation: "负缩放镜像坐标系下 fillRect 的落点",
    },
    run(a) {
      const context = a.context;
      // Negative scale mirrors the coordinate system; rects follow.
      context.scale(-1, 1);
      context.fillStyle = "#ff0000";
      context.fillRect(-40, 8, 24, 16);
      context.setTransform(1, 0, 0, -1, 0, 64);
      context.fillStyle = "#00ff00";
      context.fillRect(40, 8, 16, 24);
      context.setTransform(-2, 0, 0, -1, 64, 64);
      context.fillStyle = "#0000ff";
      context.fillRect(24, 40, 6, 12);
    },
  },
  {
    ...renderBase,
    id: "rect.fillRect.negative-size",
    requirements: ["context.fillRect"],
    display: {
      status: "included",
      observation: "负宽/高 fillRect 从原点角向左/上扩展",
    },
    run(a) {
      const context = a.context;
      // Negative extents grow the rect left/up from the origin corner.
      context.fillStyle = "#ff0000";
      context.fillRect(32, 32, -16, -24);
      context.fillStyle = "#00ff00";
      context.fillRect(56, 8, -12, 16);
      context.fillStyle = "#0000ff";
      context.fillRect(8, 56, 16, -12);
    },
  },
  {
    ...renderBase,
    id: "rect.fillRect.alpha-overlap",
    requirements: ["context.fillRect", "context.globalAlpha"],
    display: {
      status: "included",
      observation: "globalAlpha 0 不绘制；半透明叠加的混合结果",
    },
    run(a) {
      const context = a.context;
      // globalAlpha 0 paints nothing at all.
      context.globalAlpha = 0;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, 64, 64);
      context.globalAlpha = 1;
      context.fillStyle = "#0000ff";
      context.fillRect(4, 4, 40, 40);
      context.globalAlpha = 0.5;
      context.fillStyle = "#ff0000";
      context.fillRect(16, 16, 40, 40);
      context.globalAlpha = 1;
      context.fillStyle = "rgba(0, 255, 0, 0.25)";
      context.fillRect(28, 28, 32, 32);
    },
  },
  {
    ...renderBase,
    id: "rect.fillRect.degenerate",
    requirements: ["context.fillRect"],
    display: {
      status: "included",
      observation: "零宽/高 fillRect 不绘制；真实填充正常落位",
    },
    kind: "combined",
    async run(a) {
      const context = a.context;
      // Zero width or height covers no pixels: strictly no-ops.
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 0, 8);
      context.fillRect(8, 0, 8, 0);
      context.fillRect(56, 56, 0, 0);
      context.fillStyle = "#00ff00";
      context.fillRect(4, 32, 32, 16);
      const scene = await dumpScene(a);
      a.assert(
        pixelsEqual(scene.pixel(0, 4), TRANSPARENT) &&
          pixelsEqual(scene.pixel(12, 4), TRANSPARENT) &&
          pixelsEqual(scene.pixel(56, 56), TRANSPARENT),
        "zero-area fillRects paint nothing",
      );
      a.assert(
        pixelsEqual(scene.pixel(8, 40), [0, 255, 0, 255]),
        "the real fill still lands",
      );
      a.observe("degenerateNoOps", true);
    },
  },
];
