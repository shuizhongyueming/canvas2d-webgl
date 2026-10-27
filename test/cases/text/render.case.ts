import type { CaseDefinition } from "../../types/testing.js";
import { loadImage, STRIPES_3x5 } from "../paint/fixtures.js";
import { assignStyle } from "./helpers.js";

const renderBase = {
  kind: "render" as const,
  width: 64,
  height: 64,
  seed: 1,
};

export const cases: CaseDefinition[] = [
  {
    ...renderBase,
    id: "context.fillText.render",
    requirements: ["context.fillText", "context.font"],
    fonts: ["10px sans-serif", "24px sans-serif"],
    display: {
      status: "included",
      observation: "字形、填充颜色与水平/右对齐位置",
    },
    run(a) {
      const context = a.context;
      // Default state: 10px sans-serif, black fill, start/alphabetic.
      context.fillText("Def", 4, 12);
      context.font = "24px sans-serif";
      context.fillStyle = "#cc1a33";
      context.fillText("Ag_", 4, 40);
      context.textAlign = "right";
      context.fillStyle = "#1a40bf";
      context.fillText("Tail", 60, 60);
    },
  },
  {
    ...renderBase,
    id: "context.strokeText.render",
    requirements: ["context.strokeText", "context.font", "context.lineWidth"],
    fonts: ["24px sans-serif"],
    display: {
      status: "included",
      observation: "描边字形、线宽与描边颜色；边缘裁剪处描边被画布截断",
    },
    run(a) {
      const context = a.context;
      context.font = "24px sans-serif";
      context.lineWidth = 1;
      context.strokeStyle = "#cc1a33";
      context.strokeText("Thin", 4, 24);
      context.lineWidth = 3;
      context.lineJoin = "round";
      context.strokeStyle = "#1a40bf";
      context.strokeText("Bold", 4, 52);
      // Stroke margins clipped by the scene edges on both sides.
      context.lineWidth = 2;
      context.strokeStyle = "#0a8f3c";
      context.strokeText("Edge", 44, 62);
    },
  },
  {
    ...renderBase,
    id: "text.render.align-baseline",
    requirements: [
      "context.fillText",
      "context.textAlign",
      "context.textBaseline",
    ],
    width: 132,
    height: 132,
    fonts: ["16px sans-serif"],
    display: {
      status: "included",
      observation: "各对齐/基线下字形相对红色十字锚点的位置",
    },
    run(a) {
      const context = a.context;
      context.font = "16px sans-serif";
      const aligns = ["left", "center", "right"] as const;
      const baselines = ["top", "middle", "bottom"] as const;
      for (const [row, baseline] of baselines.entries())
        for (const [column, align] of aligns.entries()) {
          const x = 22 + column * 44;
          const y = 22 + row * 44;
          // Anchor marker: the text placement is relative to this cross.
          context.fillStyle = "#ff0000";
          context.fillRect(x - 2, y, 5, 1);
          context.fillRect(x, y - 2, 1, 5);
          context.fillStyle = "#202040";
          context.textAlign = align;
          context.textBaseline = baseline;
          context.fillText("Ag", x, y);
        }
    },
  },
  {
    ...renderBase,
    id: "text.render.transform",
    requirements: [
      "context.fillText",
      "context.rotate",
      "context.scale",
      "context.setTransform",
    ],
    width: 128,
    height: 128,
    fonts: ["20px sans-serif"],
    display: {
      status: "included",
      observation: "旋转、非等比缩放与镜像变换下的字形形状与位置",
    },
    run(a) {
      const context = a.context;
      context.font = "20px sans-serif";
      context.fillStyle = "#cc1a33";
      context.translate(64, 24);
      context.rotate(Math.PI / 6);
      context.fillText("Rot", 0, 0);
      // Anisotropic scale stretches the glyphs with the draw-time transform.
      context.setTransform(2, 0, 0, 0.5, 4, 80);
      context.fillStyle = "#1a40bf";
      context.fillText("Scl", 0, 0);
      // Mirrored horizontally around x=120.
      context.setTransform(-1, 0, 0, 1, 120, 110);
      context.fillStyle = "#0a8f3c";
      context.fillText("Mir", 0, 0);
    },
  },
  {
    ...renderBase,
    id: "text.render.cjk",
    requirements: ["context.fillText", "context.font"],
    width: 128,
    height: 64,
    fonts: ["24px sans-serif"],
    display: {
      status: "included",
      observation: "中文字形渲染与混排基线位置",
    },
    run(a) {
      const context = a.context;
      context.font = "24px sans-serif";
      context.fillStyle = "#cc1a33";
      context.fillText("画世界", 4, 28);
      context.fillStyle = "#1a40bf";
      context.fillText("Ag_中文xy", 4, 56);
    },
  },
  {
    ...renderBase,
    id: "text.render.paint-alpha",
    requirements: [
      "context.fillText",
      "context.fillStyle",
      "context.globalAlpha",
      "context.createLinearGradient",
    ],
    width: 128,
    height: 64,
    fonts: ["24px sans-serif"],
    display: {
      status: "included",
      observation: "渐变与半透明填充文字；globalAlpha 0 的文字完全不显示",
    },
    run(a) {
      const context = a.context;
      context.font = "24px sans-serif";
      const gradient = context.createLinearGradient(0, 0, 96, 0);
      gradient.addColorStop(0, "#ff0000");
      gradient.addColorStop(1, "#0000ff");
      assignStyle(context, "fillStyle", gradient);
      context.fillText("Grad", 2, 24);
      // Translucent fills compose over the gradient text where they overlap.
      context.globalAlpha = 0.5;
      context.fillStyle = "#0a8f3c";
      context.fillText("Half", 32, 44);
      context.globalAlpha = 1;
      context.fillStyle = "rgba(204, 26, 51, 0.25)";
      context.fillText("Rgba", 56, 60);
      // globalAlpha 0 paints nothing at all.
      context.globalAlpha = 0;
      context.fillStyle = "#ffffff";
      context.fillText("Gone", 64, 20);
    },
  },
  {
    ...renderBase,
    id: "text.render.paint-stroke",
    requirements: [
      "context.strokeText",
      "context.strokeStyle",
      "context.createLinearGradient",
      "context.createPattern",
    ],
    width: 128,
    height: 64,
    fonts: ["28px sans-serif"],
    display: {
      status: "included",
      observation: "渐变与图案描边文字的外观",
    },
    async run(a) {
      const context = a.context;
      context.font = "28px sans-serif";
      context.lineWidth = 2;
      const gradient = context.createLinearGradient(0, 0, 0, 64);
      gradient.addColorStop(0, "#ff0000");
      gradient.addColorStop(1, "#0000ff");
      assignStyle(context, "strokeStyle", gradient);
      context.strokeText("Grad", 2, 28);
      const pattern = context.createPattern(
        await loadImage(STRIPES_3x5),
        "repeat",
      );
      a.assert(pattern !== null, "repeat pattern created for the stroke");
      context.lineJoin = "round";
      assignStyle(context, "strokeStyle", pattern);
      context.strokeText("Patt", 2, 58);
    },
  },
  {
    ...renderBase,
    id: "text.render.pattern-transform",
    requirements: [
      "context.fillText",
      "context.createPattern",
      "context.rotate",
    ],
    width: 128,
    height: 96,
    fonts: ["24px sans-serif"],
    display: {
      status: "included",
      observation: "图案填充文字及旋转后图案的相位",
    },
    async run(a) {
      const context = a.context;
      context.font = "24px sans-serif";
      const pattern = context.createPattern(
        await loadImage(STRIPES_3x5),
        "repeat",
      );
      a.assert(pattern !== null, "repeat pattern created for text fill");
      assignStyle(context, "fillStyle", pattern);
      context.fillText("Pattern", 4, 28);
      context.translate(32, 48);
      context.rotate(Math.PI / 8);
      context.fillText("Tilt", 0, 0);
    },
  },
  {
    ...renderBase,
    id: "text.render.font-cache",
    requirements: ["context.fillText", "context.font"],
    width: 128,
    height: 80,
    fonts: ["12px monospace", "24px sans-serif"],
    display: {
      status: "included",
      observation: "字体来回切换后同一文字的字形与尺寸恢复一致",
    },
    run(a) {
      const context = a.context;
      context.fillStyle = "#000000";
      context.font = "12px monospace";
      context.fillText("Cache", 4, 20);
      context.font = "24px sans-serif";
      context.fillText("Cache", 4, 48);
      context.font = "12px monospace";
      context.fillText("Cache", 4, 72);
      context.fillText("Cache", 4, 72);
    },
  },
];
