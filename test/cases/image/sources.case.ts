import type { CaseDefinition } from "../../types/testing.js";
import { isCompat, outcome } from "../shared.js";
import { callRaw, loadImage, STRIPES_3x5 } from "../paint/fixtures.js";
import { dumpScene, hooksOf, pixelsEqual } from "../rect/helpers.js";
import { drawImage } from "./helpers.js";

const base = {
  kind: "combined" as const,
  width: 32,
  height: 16,
  seed: 1,
  fonts: [] as string[],
  requirements: ["context.drawImage", "IMG-01"],
};
export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "image.offscreen-cross-realm",
    display: {
      status: "included",
      observation:
        "OffscreenCanvas 与跨 realm 图片/画布绘制到主画布的输出；辅助画布仅作为输入",
    },
    async run(a) {
      const source = new OffscreenCanvas(4, 4);
      const context = source.getContext("2d");
      if (!context) throw new Error("OffscreenCanvas 2d unavailable");
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 4, 4);
      drawImage(a.context, source, 0, 0);
      const frame = document.createElement("iframe");
      document.body.append(frame);
      try {
        const doc = frame.contentDocument!;
        const image = doc.createElement("img");
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () =>
            reject(new Error("cross-realm image load failed"));
          image.src = STRIPES_3x5;
        });
        image.width = 30;
        image.height = 50;
        drawImage(a.context, image, 8, 0);
        const canvas = doc.createElement("canvas");
        canvas.width = 2;
        canvas.height = 2;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#0000ff";
        ctx.fillRect(0, 0, 2, 2);
        drawImage(a.context, canvas, 16, 0);
        const scene = await dumpScene(a);
        a.assert(
          pixelsEqual(scene.pixel(1, 1), [255, 0, 0, 255]),
          "OffscreenCanvas source uploads",
        );
        a.assert(
          pixelsEqual(scene.pixel(8, 0), [255, 0, 0, 255]) &&
            pixelsEqual(scene.pixel(10, 4), [0, 0, 255, 255]) &&
            scene.pixel(11, 0)[3] === 0,
          "cross-realm image uses intrinsic dimensions",
        );
        a.assert(
          pixelsEqual(scene.pixel(17, 1), [0, 0, 255, 255]),
          "cross-realm canvas source uploads",
        );
      } finally {
        frame.remove();
      }
    },
  },
  {
    ...base,
    id: "image.unsupported-native-source",
    kind: "semantic",
    async run(a) {
      const image = await loadImage(STRIPES_3x5);
      const bitmap = await createImageBitmap(image);
      try {
        a.assert(
          outcome(() => callRaw(a.context, "drawImage", bitmap, 0, 0)) ===
            (isCompat(a) ? "unsupported-api" : "ok"),
          "unapproved ImageBitmap reports unsupported-api",
        );
      } finally {
        bitmap.close();
      }
    },
  },
  {
    ...base,
    id: "image.upload-security",
    kind: "semantic",
    async run(a) {
      const hooks = await hooksOf(a);
      const url = new URL("/test/cases/image/source.png", location.href);
      url.hostname = "localhost";
      const image = await loadImage(url.href);
      const tainted = document.createElement("canvas");
      tainted.width = 3;
      tainted.height = 2;
      const context = tainted.getContext("2d")!;
      context.drawImage(image, 0, 0);
      a.assert(
        outcome(() => context.getImageData(0, 0, 1, 1)) === "SecurityError",
        "fixture canvas is actually tainted",
      );
      // Decision #48: drawImage sources are CORS-clean only. The compat path
      // uploads synchronously, so the native SecurityError must surface as-is
      // (outcome prefers a library code when present); the native reference
      // keeps its draw-and-taint semantics. Both sides keep the same message
      // because the harness compares reference and actual checks pairwise.
      for (const source of [image, tainted])
        a.assert(
          outcome(() => drawImage(a.context, source, 0, 0)) ===
            (isCompat(a) ? "SecurityError" : "ok"),
          "tainted source: compat propagates SecurityError unchanged; native draws and taints",
        );
      if (
        hooks &&
        (hooks.resourceCounts().textures !== 0 ||
          hooks.resourceCounts().textureLeases !== 0 ||
          hooks.readScene().pixels.some((value) => value !== 0))
      )
        throw new Error(
          "failed upload changed the scene or retained resources",
        );
    },
  },
];
