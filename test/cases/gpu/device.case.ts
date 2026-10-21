import type { CaseDefinition } from "../../types/testing.js";
import {
  BLUE,
  GREEN,
  RED,
  captureError,
  countPixels,
  isTransparent,
  loadGpu,
  makeRasterSource,
  makeRenderer,
  pixelAt,
  rectDraw,
  settle,
  waitFor,
} from "./device-driver.js";

export const cases: CaseDefinition[] = [
  {
    id: "gpu.device.context-attributes",
    requirements: ["CAN-01"],
    kind: "semantic",
    width: 32,
    height: 32,
    seed: 1,
    fonts: [],
    async run(a) {
      const { gpu, gl, device } = await makeRenderer(8, 6);
      const attributes = gl.getContextAttributes();
      a.assert(!!attributes, "context attributes are readable");
      a.observe("attributes", {
        alpha: attributes?.alpha === true,
        premultipliedAlpha: attributes?.premultipliedAlpha === true,
        stencil: attributes?.stencil === true,
        preserveDrawingBuffer: attributes?.preserveDrawingBuffer === false,
      });
      a.observe("stencilBitsPositive", (gl.getParameter(gl.STENCIL_BITS) as number) > 0);
      a.observe("status", device.status);
      a.observe("generation", device.generation);
      a.observe("size", [device.width, device.height]);
      const mismatched = document.createElement("canvas");
      mismatched.width = 4;
      mismatched.height = 4;
      mismatched.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: true,
        stencil: false,
        preserveDrawingBuffer: false,
      });
      a.observe(
        "mismatchCode",
        captureError(() => gpu.createSceneRenderer(mismatched))?.code ??
          "no-error",
      );
      const bound2d = document.createElement("canvas");
      bound2d.getContext("2d");
      a.observe(
        "bound2dCode",
        captureError(() => gpu.createSceneRenderer(bound2d))?.code ??
          "no-error",
      );
      device.dispose();
    },
  },
  {
    id: "gpu.device.init-rollback",
    requirements: ["CAN-01"],
    kind: "semantic",
    width: 32,
    height: 32,
    seed: 1,
    fonts: [],
    async run(a) {
      const gpu = await loadGpu();
      for (const step of ["programs", "scene"] as const) {
        const canvas = document.createElement("canvas");
        canvas.width = 8;
        canvas.height = 8;
        a.observe(
          `failAfter:${step}`,
          captureError(() => gpu.createSceneRenderer(canvas, { failAfter: step }))
            ?.code ?? "no-error",
        );
        const gl = canvas.getContext("webgl") as WebGLRenderingContext | null;
        a.observe(`aliveAfter:${step}`, !!gl && !gl.isContextLost());
        a.observe(`sizeKept:${step}`, [canvas.width, canvas.height]);
        const renderer = gpu.createSceneRenderer(canvas);
        renderer.device.draw(
          rectDraw(
            renderer.device.generation,
            { x: 0, y: 0, width: 8, height: 8 },
            RED,
          ),
        );
        a.observe(
          `recovered:${step}`,
          pixelAt(renderer.hooks.readScene(), 0, 0),
        );
        renderer.device.dispose();
      }
    },
  },
  {
    id: "gpu.device.size-limits",
    requirements: ["CAN-01"],
    kind: "semantic",
    width: 32,
    height: 32,
    seed: 1,
    fonts: [],
    async run(a) {
      const { gpu, gl, device, hooks } = await makeRenderer(4, 4);
      const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      a.assert(maxTextureSize > 0, "MAX_TEXTURE_SIZE is readable");
      const generation = device.generation;
      a.observe(
        "oversizeCode",
        captureError(() => device.resize(maxTextureSize + 1, 1))?.code ??
          "no-error",
      );
      a.observe(
        "zeroCode",
        captureError(() => device.resize(0, 4))?.code ?? "no-error",
      );
      a.observe("sizeUnchanged", [device.width, device.height]);
      a.observe("generationUnchanged", device.generation === generation);
      const big = document.createElement("canvas");
      big.width = maxTextureSize + 1;
      big.height = 1;
      a.observe(
        "createOversizeCode",
        captureError(() => gpu.createSceneRenderer(big))?.code ?? "no-error",
      );
      device.draw(
        rectDraw(device.generation, { x: 0, y: 0, width: 4, height: 4 }, RED),
      );
      device.resize(4, 4);
      a.observe("generationAfterResize", device.generation);
      a.observe("sceneCleared", countPixels(hooks.readScene(), isTransparent));
      device.dispose();
    },
  },
  {
    id: "gpu.device.lose-restore",
    requirements: ["LIFE-02", "LIFE-03"],
    kind: "semantic",
    width: 32,
    height: 32,
    seed: 1,
    fonts: [],
    async run(a) {
      const { device, hooks } = await makeRenderer(4, 4);
      device.draw(
        rectDraw(device.generation, { x: 0, y: 0, width: 4, height: 4 }, RED),
      );
      await hooks.whenPresented(device.generation);
      const generation = device.generation;
      device.lose();
      a.observe("lostStatus", device.status);
      a.observe("lostGeneration", device.generation);
      device.draw(
        rectDraw(generation, { x: 0, y: 0, width: 2, height: 4 }, BLUE),
      );
      a.observe(
        "staleWait",
        (await settle(hooks.whenPresented(generation))).outcome,
      );
      a.observe(
        "readDuringLoss",
        captureError(() => hooks.readScene())?.code ?? "no-error",
      );
      device.restore();
      a.observe("restoredStatus", device.status);
      a.observe("restoredGeneration", device.generation);
      a.observe(
        "sceneAfterRestore",
        countPixels(hooks.readScene(), isTransparent),
      );
      device.draw(
        rectDraw(device.generation, { x: 0, y: 0, width: 4, height: 4 }, GREEN),
      );
      a.observe("afterRestore", pixelAt(hooks.readScene(), 0, 0));
      device.dispose();
      const second = await makeRenderer(4, 4);
      const extension = second.gl.getExtension("WEBGL_lose_context");
      if (!extension) throw new Error("WEBGL_lose_context unavailable");
      second.device.draw(
        rectDraw(
          second.device.generation,
          { x: 0, y: 0, width: 4, height: 4 },
          RED,
        ),
      );
      extension.loseContext();
      second.device.lose();
      a.observe("realLost", second.gl.isContextLost());
      a.observe(
        "restoreWhileLost",
        captureError(() => second.device.restore())?.code ?? "no-error",
      );
      extension.restoreContext();
      const realRestored = await waitFor(() => !second.gl.isContextLost());
      a.observe("realRestored", realRestored);
      if (realRestored) {
        second.device.restore();
        second.device.draw(
          rectDraw(
            second.device.generation,
            { x: 0, y: 0, width: 4, height: 4 },
            BLUE,
          ),
        );
        a.observe("afterRealRestore", pixelAt(second.hooks.readScene(), 0, 0));
      } else {
        a.observe(
          "afterRealRestore",
          "skipped: software driver keeps the context lost",
        );
      }
      second.device.dispose();
    },
  },
  {
    id: "gpu.device.dispose-semantics",
    requirements: ["LIFE-01"],
    kind: "semantic",
    width: 32,
    height: 32,
    seed: 1,
    fonts: [],
    async run(a) {
      const source = makeRasterSource(
        1,
        1,
        { x: 0, y: 0, width: 1, height: 1 },
        (context) => {
          context.fillStyle = "#ff0000";
          context.fillRect(0, 0, 1, 1);
        },
      );
      const { device, hooks } = await makeRenderer(4, 4);
      device.draw(
        rectDraw(device.generation, { x: 0, y: 0, width: 4, height: 4 }, RED),
      );
      const generation = device.generation;
      device.dispose();
      device.dispose();
      a.observe("status", device.status);
      a.observe("counts", hooks.resourceCounts());
      a.observe(
        "staleWait",
        (await settle(hooks.whenPresented(generation))).outcome,
      );
      a.observe(
        "drawCode",
        captureError(() =>
          device.draw(
            rectDraw(generation, { x: 0, y: 0, width: 1, height: 1 }, RED),
          ),
        )?.code ?? "no-error",
      );
      a.observe(
        "resizeCode",
        captureError(() => device.resize(2, 2))?.code ?? "no-error",
      );
      a.observe(
        "acquireCode",
        captureError(() => device.acquireTexture(source))?.code ?? "no-error",
      );
      a.observe(
        "retainCode",
        captureError(() => device.retain({ id: 1, generation }))?.code ??
          "no-error",
      );
      a.observe(
        "readCode",
        captureError(() => hooks.readScene())?.code ?? "no-error",
      );
      source.release();
    },
  },
];
