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
 * fill() rendering through the approved native asset service: the recorded
 * path is replayed with its construction-time transforms and rasterized
 * natively, so concave coverage, winding, curve flattening and antialiasing
 * are the reference rasterizer's own. Exact-pixel assertions only cover
 * deterministic geometry; edges stay with the render pairs for review.
 */
export const cases: CaseDefinition[] = [
  {
    ...renderBase,
    id: "context.fill.render",
    requirements: [
      "context.fill",
      "context.beginPath",
      "context.moveTo",
      "context.lineTo",
      "context.closePath",
      "context.arc",
    ],
    display: {
      status: "included",
      observation: "折线与圆形的填充形状与抗锯齿边缘",
    },
    run(a) {
      const context = a.context;
      context.fillStyle = "#ff0000";
      context.beginPath();
      context.moveTo(6, 6);
      context.lineTo(30, 6);
      context.lineTo(18, 26);
      context.lineTo(30, 46);
      context.lineTo(6, 46);
      context.closePath();
      context.fill();
      context.fillStyle = "#0000ff";
      context.beginPath();
      context.arc(46, 32, 14, 0, Math.PI * 2);
      context.fill();
    },
  },
  {
    ...renderBase,
    id: "path.fill.concave-self-intersect",
    requirements: [
      "context.fill",
      "context.moveTo",
      "context.lineTo",
      "context.closePath",
    ],
    display: {
      status: "included",
      observation: "凹自交路径在 nonzero/evenodd 下的覆盖差异",
    },
    run(a) {
      const context = a.context;
      // A concave arrow and a self-intersecting bowtie, nonzero winding.
      context.fillStyle = "#ff0000";
      context.beginPath();
      context.moveTo(4, 4);
      context.lineTo(28, 4);
      context.lineTo(16, 16);
      context.lineTo(28, 28);
      context.lineTo(4, 28);
      context.closePath();
      context.fill();
      context.fillStyle = "#00ff00";
      context.beginPath();
      context.moveTo(36, 36);
      context.lineTo(60, 60);
      context.lineTo(60, 36);
      context.lineTo(36, 60);
      context.closePath();
      context.fill();
    },
  },
  {
    ...renderBase,
    id: "path.fill.arc-anticlockwise",
    requirements: ["context.fill", "context.arc"],
    display: {
      status: "included",
      observation: "逆时针圆弧填充的扇区方向",
    },
    run(a) {
      const context = a.context;
      // The same endpoints swept both ways: direction decides the coverage.
      context.fillStyle = "#ff0000";
      context.beginPath();
      context.arc(18, 18, 12, 0, Math.PI * 0.5, false);
      context.lineTo(18, 18);
      context.closePath();
      context.fill();
      context.fillStyle = "#0000ff";
      context.beginPath();
      context.arc(44, 44, 12, 0, Math.PI * 0.5, true);
      context.lineTo(44, 44);
      context.closePath();
      context.fill();
      // A full sweep stated anticlockwise equals the clockwise circle.
      context.fillStyle = "#00ff00";
      context.beginPath();
      context.arc(46, 16, 10, 0, Math.PI * 2, true);
      context.fill();
    },
  },
  {
    ...renderBase,
    id: "path.fill.arcTo-ellipse-quadratic",
    requirements: [
      "context.fill",
      "context.arcTo",
      "context.ellipse",
      "context.quadraticCurveTo",
      "context.moveTo",
      "context.lineTo",
    ],
    display: {
      status: "included",
      observation: "arcTo/ellipse/quadratic 曲线的填充轮廓",
    },
    run(a) {
      const context = a.context;
      context.fillStyle = "#ff0000";
      context.beginPath();
      context.moveTo(4, 56);
      context.lineTo(4, 20);
      context.arcTo(4, 4, 20, 4, 8);
      context.lineTo(28, 4);
      context.closePath();
      context.fill();
      context.fillStyle = "#00ff00";
      context.beginPath();
      context.ellipse(46, 16, 14, 8, Math.PI / 6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#0000ff";
      context.beginPath();
      context.moveTo(36, 40);
      context.quadraticCurveTo(48, 24, 60, 40);
      context.quadraticCurveTo(48, 56, 36, 40);
      context.closePath();
      context.fill();
    },
  },
  {
    ...renderBase,
    id: "path.fill.multi-subpath-closePath",
    requirements: [
      "context.fill",
      "context.moveTo",
      "context.lineTo",
      "context.closePath",
      "context.rect",
    ],
    display: {
      status: "included",
      observation: "多子路径 closePath 后的合并填充结果",
    },
    run(a) {
      const context = a.context;
      // One fill covers every subpath; an unclosed subpath closes implicitly,
      // and closePath reopens at the subpath start for the next segment.
      context.fillStyle = "#ff0000";
      context.beginPath();
      context.moveTo(4, 4);
      context.lineTo(16, 4);
      context.lineTo(10, 16);
      context.closePath();
      context.moveTo(24, 4);
      context.lineTo(36, 4);
      context.lineTo(30, 16); // unclosed: filled as if closed
      context.rect(44, 4, 12, 12);
      context.moveTo(8, 28);
      context.lineTo(20, 28);
      context.lineTo(14, 40);
      context.closePath();
      context.moveTo(8, 28); // new subpath after closePath starts fresh
      context.lineTo(28, 44);
      context.lineTo(8, 44);
      context.closePath();
      context.fill();
    },
  },
  {
    ...renderBase,
    id: "path.fill.construction-transform",
    requirements: [
      "context.fill",
      "context.rect",
      "context.translate",
      "context.rotate",
      "context.scale",
      "context.setTransform",
      "context.save",
      "context.restore",
    ],
    display: {
      status: "included",
      observation: "路径按构建时变换记录；绘制时变换只影响落点",
    },
    run(a) {
      const context = a.context;
      // Geometry bakes the construction-time transform; the fill-time
      // transform only interprets the paint, never the geometry.
      context.fillStyle = "#ff0000";
      context.save();
      context.translate(20, 20);
      context.rotate(Math.PI / 4);
      context.rect(-10, -10, 20, 20);
      context.restore();
      context.fill();
      context.fillStyle = "#00ff00";
      context.save();
      context.scale(2, 0.5);
      context.rect(16, 72, 12, 24); // device (32,36)-(56,48)
      context.restore();
      context.fill();
      // Building under identity and filling under a translation must not move
      // the blue square.
      context.fillStyle = "#0000ff";
      context.beginPath();
      context.rect(48, 44, 12, 12);
      context.setTransform(1, 0, 0, 1, -20, 30);
      context.fill();
      context.setTransform(1, 0, 0, 1, 0, 0);
    },
  },
  {
    ...renderBase,
    id: "path.fill.retained-after-draw",
    requirements: ["context.fill", "context.rect", "context.fillStyle"],
    kind: "combined",
    display: {
      status: "included",
      observation: "fill 不清除当前路径：第二次 fill 用蓝色重画同一矩形",
    },
    async run(a) {
      const context = a.context;
      context.fillStyle = "#ff0000";
      context.beginPath();
      context.rect(8, 8, 24, 24);
      context.fill();
      // fill() keeps the current path: a second fill repaints the same rect.
      context.fillStyle = "#0000ff";
      context.fill();
      const scene = await dumpScene(a);
      a.assert(
        pixelsEqual(scene.pixel(16, 16), [0, 0, 255, 255]),
        "the second fill repaints the retained path",
      );
      a.assert(
        pixelsEqual(scene.pixel(4, 4), TRANSPARENT),
        "nothing leaks outside the path",
      );
      a.observe("pathRetained", true);
    },
  },
  {
    ...renderBase,
    id: "path.fill.degenerate",
    requirements: [
      "context.fill",
      "context.moveTo",
      "context.lineTo",
      "context.closePath",
    ],
    display: {
      status: "included",
      observation: "空/点/零长路径不绘制；含 NaN 的路径只绘制有限剩余三角形",
    },
    kind: "combined",
    async run(a) {
      const context = a.context;
      context.fillStyle = "#ff0000";
      // An empty path, a point-only subpath and a zero-length line paint
      // nothing; non-finite commands drop out of the recording.
      context.fill();
      context.beginPath();
      context.moveTo(10, 10);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(20, 20);
      context.lineTo(20, 20);
      context.fill();
      const empty = await dumpScene(a);
      a.assert(
        empty.count((pixel) => pixel[3] !== 0) === 0,
        "empty and point-only paths paint nothing",
      );
      context.beginPath();
      context.moveTo(4, 4);
      context.lineTo(NaN, 8);
      context.lineTo(28, 4);
      context.lineTo(16, 20);
      context.closePath();
      context.fill();
      const scene = await dumpScene(a);
      a.assert(
        pixelsEqual(scene.pixel(16, 10), [255, 0, 0, 255]),
        "the finite remainder still fills",
      );
      a.observe("degenerateHandled", true);
    },
  },
  ...(["fill", "stroke"] as const).map(
    (mode): CaseDefinition => ({
      ...renderBase,
      id: `path.${mode}.empty-path`,
      kind: "combined",
      requirements: [`context.${mode}`],
      display: {
        status: "included",
        observation: "空路径与画布外路径操作后原有红底保持",
      },
      async run(a) {
        const context = a.context;
        context.fillStyle = "#ff0000";
        context.fillRect(0, 0, 64, 64);
        context[mode]();
        const empty = await dumpScene(a);
        a.assert(
          pixelsEqual(empty.pixel(8, 8), [255, 0, 0, 255]),
          "empty path preserves the destination",
        );
        context.rect(100, 100, 8, 8);
        context[mode]();
        const outside = await dumpScene(a);
        a.assert(
          pixelsEqual(outside.pixel(8, 8), [255, 0, 0, 255]),
          "offscreen source-over preserves the destination",
        );
        a.observe("sourceIn", "pending-#22");
      },
    }),
  ),
  {
    ...renderBase,
    id: "path.fill.state-stack",
    requirements: [
      "context.fill",
      "context.rect",
      "context.save",
      "context.restore",
      "context.globalAlpha",
    ],
    display: {
      status: "included",
      observation: "save/restore 恢复样式与透明度，但不清除当前路径",
    },
    kind: "combined",
    async run(a) {
      const context = a.context;
      // The current path is not part of save/restore state: it survives the
      // stack while styles and alpha follow it.
      context.save();
      context.fillStyle = "#ff0000";
      context.globalAlpha = 0.5;
      context.beginPath();
      context.rect(8, 8, 24, 24);
      context.restore();
      context.fill(); // black at alpha 1 over the restored state
      const scene = await dumpScene(a);
      a.assert(
        pixelsEqual(scene.pixel(16, 16), [0, 0, 0, 255]),
        "the path survives save/restore and fills with the restored state",
      );
      a.observe("pathOutsideStack", true);
    },
  },
];
