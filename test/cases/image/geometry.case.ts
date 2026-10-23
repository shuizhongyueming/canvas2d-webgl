import type { CaseDefinition } from "../../types/testing.js";
import { isCompat, outcome } from "../shared.js";
import { callRaw, loadImage, STRIPES_3x5 } from "../paint/fixtures.js";
import { dumpScene, pixelsEqual } from "../rect/helpers.js";
import {
  bandCanvas,
  cornerCanvas,
  drawImage,
  fillSource,
  makeSourceCanvas,
} from "./helpers.js";

const base = {
  kind: "combined" as const,
  width: 64,
  height: 48,
  seed: 1,
  fonts: [] as string[],
  requirements: ["context.drawImage", "IMG-01"],
};

export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "image.negative-crop-transform",
    display: {
      status: "included",
      observation: "负裁剪不翻转条纹；变换镜像才翻转；越源裁剪留白",
    },
    async run(a) {
      const image = await loadImage(STRIPES_3x5);
      drawImage(a.context, image, 3, 5, -3, -5, 2, 2, 3, 5);
      drawImage(a.context, image, 10, 7, -3, -5);
      drawImage(a.context, image, -1, -2, 4, 7, 16, 2, 4, 7);
      a.context.setTransform(0, 1, -1, 0, 30, 2);
      drawImage(a.context, image, 0, 0);
      a.context.setTransform(-1, 0, 0, 1, 38, 2);
      drawImage(a.context, image, 0, 0);
      a.context.setTransform(1, 0, 0, 1, 0, 0);
      const scene = await dumpScene(a);
      for (const [x, y, color] of [
        [2, 2, [255, 0, 0, 255]],
        [4, 2, [0, 0, 255, 255]],
        [7, 2, [255, 0, 0, 255]],
        [9, 2, [0, 0, 255, 255]],
        [17, 4, [255, 0, 0, 255]],
        [19, 8, [0, 0, 255, 255]],
        [27, 2, [255, 0, 0, 255]],
        [27, 4, [0, 0, 255, 255]],
        [35, 2, [0, 0, 255, 255]],
        [37, 2, [255, 0, 0, 255]],
      ] as const)
        a.assert(
          pixelsEqual(scene.pixel(x, y), color),
          "negative extents do not flip; transform reflection does",
        );
      a.assert(
        scene.pixel(16, 3)[3] === 0 && scene.pixel(20, 4)[3] === 0,
        "out-of-source crop leaves proportional margins",
      );
    },
  },
  {
    ...base,
    id: "image.validity",
    display: {
      status: "included",
      observation: "无效与空矩形 drawImage 后主画布保持完全透明",
    },
    async run(a) {
      const empty = new Image();
      a.observe(
        "empty",
        outcome(() => drawImage(a.context, empty, 0, 0)),
      );
      const pending = new Image();
      pending.src = STRIPES_3x5;
      a.assert(!pending.complete, "fixture is pending before loading yields");
      a.observe(
        "pending",
        outcome(() => drawImage(a.context, pending, 0, 0)),
      );
      const broken = new Image();
      await new Promise<void>((resolve) => {
        broken.onerror = () => resolve();
        broken.src = "data:image/png;base64,invalid";
      });
      a.observe(
        "broken",
        outcome(() => drawImage(a.context, broken, 0, 0)),
      );
      const zero = makeSourceCanvas(0, 4, () => {});
      a.observe(
        "zero-canvas",
        outcome(() => drawImage(a.context, zero, 0, 0)),
      );
      const source = cornerCanvas();
      for (const args of [
        [0, 0, 0, 4],
        [0, 0, 4, 0],
        [0, 0, 0, 4, 0, 0, 4, 4],
        [0, 0, 4, 0, 0, 0, 4, 4],
        [20, 20, 4, 4, 0, 0, 4, 4],
      ])
        a.assert(
          outcome(() => callRaw(a.context, "drawImage", source, ...args)) ===
            "ok",
          "empty rectangles are ignored",
        );
      const scene = await dumpScene(a);
      a.assert(
        scene.count((p) => p[3] !== 0) === 0,
        "invalid and empty draws leave scene clear",
      );
    },
  },
  {
    ...base,
    id: "context.drawImage.render",
    kind: "render",
    display: {
      status: "included",
      observation:
        "条纹图与辅助画布的多种 drawImage 形式、缩放、半透明与变换绘制",
    },
    async run(a) {
      const image = await loadImage(STRIPES_3x5);
      a.context.fillStyle = "#404040";
      a.context.fillRect(0, 0, 64, 48);
      drawImage(a.context, image, 2, 2);
      drawImage(a.context, image, 8, 2, 9, 15);
      drawImage(a.context, image, 1, 0, 1, 5, 22, 2, 9, 15);
      drawImage(a.context, cornerCanvas(), 36, 2, 20, 20);
      a.context.globalAlpha = 0.5;
      drawImage(a.context, bandCanvas(), 2, 28, 16, 16);
      a.context.globalAlpha = 1;
      a.context.setTransform(0.9, 0.3, -0.3, 0.9, 34, 28);
      drawImage(a.context, image, 0, 0, 9, 15);
    },
  },
  {
    ...base,
    id: "image.alpha",
    display: {
      status: "included",
      observation: "globalAlpha 0/0.5/1 下 drawImage 的可见度差异",
    },
    async run(a) {
      const source = fillSource(
        makeSourceCanvas(4, 4, () => {}),
        "#ff0000",
      );
      a.context.globalAlpha = 0;
      drawImage(a.context, source, 0, 0);
      a.context.globalAlpha = 0.5;
      drawImage(a.context, source, 8, 0);
      a.context.globalAlpha = 1;
      drawImage(a.context, source, 16, 0);
      const scene = await dumpScene(a);
      a.assert(scene.pixel(0, 0)[3] === 0, "zero global alpha draws nothing");
      a.observe("half-alpha", scene.pixel(8, 0));
      a.assert(
        pixelsEqual(scene.pixel(16, 0), [255, 0, 0, 255]),
        "full global alpha copies source",
      );
    },
  },
  {
    ...base,
    id: "image.upload-limit",
    kind: "semantic",
    async run(a) {
      const image = await loadImage(
        `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100000" height="1"><rect width="100000" height="1" fill="red"/></svg>')}`,
      );
      const result = outcome(() => drawImage(a.context, image, 0, 0, 1, 1));
      a.assert(
        result === (isCompat(a) ? "resource-limit" : "ok"),
        "upload boundary rejects oversized source synchronously",
      );
    },
  },
];
