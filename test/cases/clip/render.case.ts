import type { CaseAdapter, CaseDefinition } from "../../types/testing.js";
import {
  TRANSPARENT,
  displayPixel,
  dumpScene,
  hooksOf,
  pixelsEqual,
} from "../rect/helpers.js";

const base = {
  kind: "render" as const,
  width: 32,
  height: 32,
  seed: 1,
  fonts: [] as string[],
};

const RED = [255, 0, 0, 255] as const;
const GREEN = [0, 255, 0, 255] as const;
const BLUE = [0, 0, 255, 255] as const;
const WHITE = [255, 255, 255, 255] as const;

type Scene = Awaited<ReturnType<typeof dumpScene>>;

function expectPixel(
  a: CaseAdapter,
  scene: Scene,
  x: number,
  y: number,
  expected: readonly [number, number, number, number],
  label: string,
): void {
  const actual = scene.pixel(x, y);
  a.assert(
    pixelsEqual(actual, expected),
    `${label} at (${x},${y}): expected ${expected.join(",")}, got ${actual.join(",")}`,
  );
}

export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "context.clip.render",
    requirements: ["context.clip", "ACC-03"],
    display: {
      status: "included",
      observation: "裁剪矩形内蓝色填充与白色内块；裁剪外保持红底",
    },
    async run(a) {
      const context = a.context;
      // Resolve the hook before drawing: after the last draw there must be no
      // await other than whenPresented before the display readback, or the
      // compositor can discard the non-preserved drawing buffer first.
      const hooks = await hooksOf(a);
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 32, 32);
      context.save();
      context.beginPath();
      context.rect(8, 8, 16, 16);
      context.clip();
      context.fillStyle = "#0000ff";
      context.fillRect(0, 0, 32, 32);
      context.fillStyle = "#ffffff";
      context.fillRect(12, 12, 8, 8);
      context.restore();
      // Display evidence uses the default framebuffer in the present window:
      // wait for the already-scheduled present, then read before the next
      // composite can discard the drawing buffer.
      if (hooks) await hooks.whenPresented(hooks.readScene().generation);
      const shown = await displayPixel(a, 16, 16);
      a.assert(
        pixelsEqual(shown, WHITE),
        `clipped drawing reaches the default framebuffer: got ${shown.join(",")}`,
      );
      const shownOutside = await displayPixel(a, 4, 4);
      a.assert(
        pixelsEqual(shownOutside, RED),
        `unclipped background reaches the default framebuffer: got ${shownOutside.join(",")}`,
      );
      const scene = await dumpScene(a);
      expectPixel(a, scene, 4, 4, RED, "outside clip keeps the background");
      expectPixel(a, scene, 8, 8, BLUE, "clip covers its top-left edge pixel");
      expectPixel(
        a,
        scene,
        16,
        16,
        WHITE,
        "drawing inside the clip composites",
      );
      expectPixel(
        a,
        scene,
        23,
        23,
        BLUE,
        "clip covers its bottom-right edge pixel",
      );
      expectPixel(a, scene, 28, 28, RED, "outside clip stays unclipped");
      expectPixel(
        a,
        scene,
        31,
        31,
        RED,
        "canvas corner stays outside the clip",
      );
    },
  },
  {
    ...base,
    id: "ACC-03.evenodd-nested-clip",
    requirements: ["ACC-03", "context.clip"],
    display: {
      status: "included",
      observation: "evenodd 环形与嵌套裁剪交集内的蓝色区域；孔洞保持白底",
    },
    async run(a) {
      const context = a.context;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, 32, 32);
      context.save();
      // Outer ring: a big rect with an evenodd hole.
      context.beginPath();
      context.rect(0, 0, 32, 32);
      context.rect(8, 8, 16, 16);
      context.clip("evenodd");
      // Nested clip intersects the ring.
      context.beginPath();
      context.rect(2, 2, 20, 20);
      context.clip();
      context.fillStyle = "#0000ff";
      context.fillRect(0, 0, 32, 32);
      context.restore();
      const scene = await dumpScene(a);
      expectPixel(a, scene, 3, 3, BLUE, "nested clip intersection is painted");
      expectPixel(a, scene, 8, 3, BLUE, "ring band above the hole is painted");
      expectPixel(a, scene, 10, 10, WHITE, "evenodd hole survives both clips");
      expectPixel(a, scene, 23, 3, WHITE, "nested clip bounds the right edge");
      expectPixel(a, scene, 3, 23, WHITE, "nested clip bounds the bottom edge");
      expectPixel(
        a,
        scene,
        0,
        0,
        WHITE,
        "outside the nested clip is untouched",
      );
    },
  },
  {
    ...base,
    id: "clip.nonzero-overlap",
    requirements: ["context.clip", "context.rect"],
    display: {
      status: "included",
      observation: "两个重叠矩形并集裁剪内的绿色填充；并集外保持透明",
    },
    async run(a) {
      const context = a.context;
      context.save();
      context.beginPath();
      context.rect(2, 2, 20, 20);
      context.rect(10, 10, 20, 20);
      context.clip();
      context.fillStyle = "#00ff00";
      context.fillRect(0, 0, 32, 32);
      context.restore();
      const scene = await dumpScene(a);
      expectPixel(a, scene, 4, 4, GREEN, "first rect is inside the union");
      expectPixel(a, scene, 24, 24, GREEN, "second rect is inside the union");
      expectPixel(a, scene, 12, 12, GREEN, "nonzero overlap stays covered");
      expectPixel(a, scene, 30, 4, TRANSPARENT, "outside the union is clipped");
      expectPixel(a, scene, 1, 1, TRANSPARENT, "outside the union is clipped");
    },
  },
  {
    ...base,
    id: "ACC-03.clear-clip-transform",
    requirements: ["ACC-03", "context.clip", "context.clearRect"],
    display: {
      status: "included",
      observation: "平移裁剪限制下的 clearRect 只清除裁剪内红底",
    },
    async run(a) {
      const context = a.context;
      // Resolve the hook before drawing: after the last draw there must be no
      // await other than whenPresented before the display readback, or the
      // compositor can discard the non-preserved drawing buffer first.
      const hooks = await hooksOf(a);
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 32, 32);
      context.save();
      context.translate(8, 8);
      context.beginPath();
      context.rect(0, 0, 16, 16);
      context.clip();
      // Clear a region larger than the clip under the transform.
      context.clearRect(0, 0, 32, 32);
      context.restore();
      const scene = await dumpScene(a);
      expectPixel(
        a,
        scene,
        12,
        12,
        TRANSPARENT,
        "clearRect is confined to the clip",
      );
      expectPixel(a, scene, 8, 8, TRANSPARENT, "clip edge pixel is cleared");
      expectPixel(a, scene, 4, 4, RED, "clearRect does not escape the clip");
      expectPixel(
        a,
        scene,
        28,
        28,
        RED,
        "clearRect does not clear unclipped areas",
      );
    },
  },
  {
    ...base,
    id: "clip.save-restore-stack",
    requirements: ["context.clip", "context.save", "context.restore"],
    display: {
      status: "included",
      observation: "嵌套裁剪下红/蓝/绿依次受外内层裁剪约束；restore 后黑色充满",
    },
    async run(a) {
      const context = a.context;
      context.save();
      context.beginPath();
      context.rect(0, 0, 16, 16);
      context.clip();
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 32, 32);
      context.save();
      context.beginPath();
      context.rect(8, 8, 16, 16);
      context.clip();
      context.fillStyle = "#0000ff";
      context.fillRect(0, 0, 32, 32);
      const nested = await dumpScene(a);
      expectPixel(
        a,
        nested,
        12,
        12,
        BLUE,
        "inner clip composites its intersection",
      );
      expectPixel(a, nested, 4, 4, RED, "inner restore keeps the outer clip");
      context.restore();
      context.fillStyle = "#00ff00";
      context.fillRect(0, 0, 32, 32);
      const outer = await dumpScene(a);
      expectPixel(a, outer, 4, 4, GREEN, "restore returns to the outer clip");
      expectPixel(a, outer, 12, 12, GREEN, "outer clip still bounds drawing");
      expectPixel(
        a,
        outer,
        20,
        20,
        TRANSPARENT,
        "outer clip excludes later drawing",
      );
      context.restore();
      context.fillStyle = "#000000";
      context.fillRect(0, 0, 32, 32);
      const reset = await dumpScene(a);
      expectPixel(a, reset, 20, 20, [0, 0, 0, 255], "restore clears the clip");
    },
  },
  {
    ...base,
    id: "clip.does-not-consume-current-path",
    requirements: ["context.clip", "context.beginPath", "context.fill"],
    display: {
      status: "included",
      observation: "clip 后当前路径仍可填充；裁剪外的绘制被截断",
    },
    async run(a) {
      const context = a.context;
      context.save();
      context.beginPath();
      context.rect(4, 4, 24, 24);
      context.clip();
      // clip() does not consume the current path: an immediate fill paints the
      // same rectangle through the new clip.
      context.fillStyle = "#ff0000";
      context.fill();
      context.fillStyle = "#0000ff";
      context.fill();
      // A later beginPath replaces the path but not the clip.
      context.beginPath();
      context.rect(16, 16, 16, 16);
      context.fillStyle = "#00ff00";
      context.fill();
      context.restore();
      const scene = await dumpScene(a);
      expectPixel(
        a,
        scene,
        4,
        4,
        BLUE,
        "clip does not consume the current path",
      );
      expectPixel(a, scene, 16, 16, GREEN, "clip survives path replacement");
      expectPixel(
        a,
        scene,
        27,
        27,
        GREEN,
        "replacement fill is cut at the clip edge",
      );
      expectPixel(
        a,
        scene,
        2,
        2,
        TRANSPARENT,
        "paint outside the clip stays clipped",
      );
    },
  },
  {
    ...base,
    id: "clip.empty-path",
    requirements: ["context.clip", "context.beginPath"],
    display: {
      status: "included",
      observation: "空路径 clip 后红底保持不变",
    },
    async run(a) {
      const context = a.context;
      // Resolve the hook before drawing: after the last draw there must be no
      // await other than whenPresented before the display readback, or the
      // compositor can discard the non-preserved drawing buffer first.
      const hooks = await hooksOf(a);
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 32, 32);
      context.save();
      context.beginPath();
      context.clip();
      context.fillStyle = "#0000ff";
      context.fillRect(0, 0, 32, 32);
      context.restore();
      const scene = await dumpScene(a);
      a.assert(
        scene.count((pixel) => pixelsEqual(pixel, RED)) === 32 * 32,
        "an empty path makes the clip region empty without erasing content",
      );
    },
  },
  {
    ...base,
    id: "clip.construction-transform",
    requirements: [
      "context.clip",
      "context.translate",
      "context.scale",
      "context.setTransform",
    ],
    display: {
      status: "included",
      observation: "按构建时变换定位的裁剪区域；后续变换只影响绘制位置",
    },
    async run(a) {
      const context = a.context;
      context.save();
      context.translate(8, 8);
      context.scale(2, 2);
      context.beginPath();
      context.rect(0, 0, 8, 8);
      context.clip();
      // Geometry is fixed at construction; later transforms only position paint.
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = "#0000ff";
      context.fillRect(0, 0, 32, 32);
      context.restore();
      const scene = await dumpScene(a);
      expectPixel(
        a,
        scene,
        8,
        8,
        BLUE,
        "transformed clip starts at its device position",
      );
      expectPixel(
        a,
        scene,
        23,
        23,
        BLUE,
        "transformed clip covers its scaled extent",
      );
      expectPixel(
        a,
        scene,
        7,
        7,
        TRANSPARENT,
        "paint outside the transformed clip is cut",
      );
      expectPixel(
        a,
        scene,
        24,
        24,
        TRANSPARENT,
        "clip does not grow with later transforms",
      );
    },
  },
  {
    ...base,
    id: "clip.depth-nesting",
    requirements: ["context.clip", "context.save", "context.restore"],
    display: {
      status: "included",
      observation: "十二层嵌套裁剪交集内的绿色填充；外层条带保持透明",
    },
    async run(a) {
      const context = a.context;
      for (let level = 0; level < 12; level += 1) {
        context.save();
        context.beginPath();
        context.rect(level, level, 32 - 2 * level, 32 - 2 * level);
        context.clip();
      }
      context.fillStyle = "#00ff00";
      context.fillRect(0, 0, 32, 32);
      for (let level = 0; level < 12; level += 1) context.restore();
      const scene = await dumpScene(a);
      expectPixel(a, scene, 11, 11, GREEN, "twelfth nested clip still paints");
      expectPixel(
        a,
        scene,
        20,
        20,
        GREEN,
        "nested intersection interior is painted",
      );
      expectPixel(
        a,
        scene,
        10,
        10,
        TRANSPARENT,
        "nested clip excludes previous bands",
      );
      expectPixel(
        a,
        scene,
        21,
        21,
        TRANSPARENT,
        "nested clip excludes outer bands",
      );
    },
  },
  {
    ...base,
    id: "clip.path-and-stroke-entries",
    requirements: ["context.clip", "context.fill", "context.strokeRect"],
    display: {
      status: "included",
      observation: "路径填充与 strokeRect 都被同一裁剪截断",
    },
    async run(a) {
      const context = a.context;
      context.save();
      context.beginPath();
      context.rect(4, 4, 24, 24);
      context.clip();
      context.fillStyle = "#ff0000";
      context.beginPath();
      context.rect(8, 8, 16, 16);
      context.fill();
      context.strokeStyle = "#0000ff";
      context.lineWidth = 2;
      context.strokeRect(6, 6, 20, 20);
      context.restore();
      const scene = await dumpScene(a);
      expectPixel(a, scene, 16, 16, RED, "path fill is clipped");
      expectPixel(
        a,
        scene,
        6,
        6,
        BLUE,
        "strokeRect is clipped to the same clip",
      );
      expectPixel(
        a,
        scene,
        2,
        16,
        TRANSPARENT,
        "stroke outside the clip is cut",
      );
      expectPixel(
        a,
        scene,
        30,
        16,
        TRANSPARENT,
        "stroke right of the clip is cut",
      );
    },
  },
  {
    ...base,
    id: "clip.source-in",
    requirements: [
      "context.clip",
      "context.globalCompositeOperation",
      "ACC-03",
    ],
    display: {
      status: "included",
      observation:
        "source-in 在裁剪内合成绿色并清空裁剪内其余区域；裁剪外红底不动",
    },
    async run(a) {
      const context = a.context;
      // Resolve the hook before drawing: after the last draw there must be no
      // await other than whenPresented before the display readback, or the
      // compositor can discard the non-preserved drawing buffer first.
      const hooks = await hooksOf(a);
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 32, 32);
      context.save();
      context.beginPath();
      context.rect(4, 4, 24, 24);
      context.clip();
      context.globalCompositeOperation = "source-in";
      context.fillStyle = "#00ff00";
      context.fillRect(12, 12, 8, 8);
      context.restore();
      const scene = await dumpScene(a);
      expectPixel(
        a,
        scene,
        16,
        16,
        GREEN,
        "source-in composites inside the clip and source",
      );
      expectPixel(
        a,
        scene,
        6,
        6,
        TRANSPARENT,
        "source-in clears inside the clip only",
      );
      expectPixel(
        a,
        scene,
        2,
        2,
        RED,
        "source-in leaves pixels outside the clip untouched",
      );
      expectPixel(
        a,
        scene,
        28,
        28,
        RED,
        "source-in clip boundary holds on all sides",
      );
    },
  },
  {
    ...base,
    id: "clip.curves-subpixel-edges",
    requirements: ["context.clip", "context.arc", "ACC-03"],
    display: {
      status: "included",
      observation: "圆形裁剪的柔和边缘与内部红色填充",
    },
    async run(a) {
      const context = a.context;
      context.save();
      context.beginPath();
      context.arc(16, 16, 10.25, 0, Math.PI * 2);
      context.clip();
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 32, 32);
      context.restore();
      const scene = await dumpScene(a);
      expectPixel(a, scene, 16, 16, RED, "curved clip interior is painted");
      expectPixel(a, scene, 16, 4, TRANSPARENT, "outside the curve is clipped");
      expectPixel(a, scene, 4, 16, TRANSPARENT, "outside the curve is clipped");
      expectPixel(a, scene, 0, 0, TRANSPARENT, "canvas corner is clipped");
      // The boundary is left to the render pair: a binary stencil cannot
      // reproduce the native soft clip edge, so no exact edge assertion here.
    },
  },
  {
    ...base,
    id: "clip.alpha-and-composite",
    requirements: [
      "context.clip",
      "context.globalAlpha",
      "context.globalCompositeOperation",
      "context.filter",
    ],
    display: {
      status: "included",
      observation: "半透明与 lighter/filter 绘制都限制在裁剪内",
    },
    async run(a) {
      const context = a.context;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, 32, 32);
      context.save();
      context.beginPath();
      context.rect(8, 8, 16, 16);
      context.clip();
      context.globalAlpha = 0.5;
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 32, 32);
      context.globalAlpha = 1;
      context.globalCompositeOperation = "lighter";
      context.filter = "brightness(120%)";
      context.fillStyle = "#0000ff";
      context.fillRect(0, 0, 32, 32);
      context.restore();
      const scene = await dumpScene(a);
      expectPixel(
        a,
        scene,
        4,
        4,
        WHITE,
        "alpha and composite stay inside the clip",
      );
      // Blended 8-bit rounding is not asserted exactly; the render pair
      // carries the composite result for review.
      a.assert(
        !pixelsEqual(scene.pixel(16, 16), WHITE),
        "clipped alpha and lighter stack actually paints",
      );
    },
  },
  {
    ...base,
    id: "clip.reset-on-size",
    requirements: ["context.clip", "canvas.width", "CAN-04"],
    display: {
      status: "included",
      observation: "同尺寸重设前裁剪限制红色区域；重设后蓝色充满整个画布",
    },
    kind: "combined" as const,
    async run(a) {
      const context = a.context;
      context.save();
      context.beginPath();
      context.rect(4, 4, 24, 24);
      context.clip();
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 32, 32);
      context.restore();
      const clipped = await dumpScene(a);
      expectPixel(
        a,
        clipped,
        2,
        2,
        TRANSPARENT,
        "clip excludes the canvas edge",
      );
      // Assigning the same width resets the drawing state and the clip.
      (a.canvas as { width: number }).width = 32;
      context.fillStyle = "#0000ff";
      context.fillRect(0, 0, 32, 32);
      const reset = await dumpScene(a);
      expectPixel(a, reset, 2, 2, BLUE, "size reset clears the clip");
      expectPixel(a, reset, 30, 30, BLUE, "size reset paints the full canvas");
    },
  },
];
