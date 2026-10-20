import type { CaseDefinition } from "../../types/testing.js";
import {
  BLUE,
  GREEN,
  RED,
  captureError,
  clearOp,
  countPixels,
  isTransparent,
  makePatternBitmap,
  makeRasterSource,
  makeRenderer,
  nextFrame,
  pixelAt,
  rasterDraw,
  readDisplayPixel,
  rectDraw,
} from "./device-driver.js";

export const cases: CaseDefinition[] = [
  {
    id: "gpu.scene.clear-and-alpha",
    requirements: ["REN-01"],
    kind: "semantic",
    width: 32,
    height: 32,
    seed: 1,
    fonts: [],
    async run(a) {
      const { device, hooks } = await makeRenderer(8, 6);
      const scene = hooks.readScene();
      a.observe("size", [scene.width, scene.height]);
      a.observe("generation", scene.generation);
      a.observe("transparentBlack", countPixels(scene, isTransparent));
      device.draw(
        rectDraw(device.generation, { x: 0, y: 0, width: 4, height: 3 }, RED),
      );
      const drawn = hooks.readScene();
      a.observe("drawn", pixelAt(drawn, 0, 0));
      a.observe("outside", pixelAt(drawn, 7, 5));
      device.draw(
        rectDraw(
          device.generation,
          { x: 4, y: 0, width: 4, height: 3 },
          [1, 0, 0, 128 / 255],
        ),
      );
      a.observe("premulRoundTrip", pixelAt(hooks.readScene(), 4, 0));
      device.dispose();
    },
  },
  {
    id: "gpu.scene.orientation-and-display",
    requirements: ["REN-01", "CAN-05"],
    kind: "semantic",
    width: 32,
    height: 32,
    seed: 1,
    fonts: [],
    async run(a) {
      const { gl, device, hooks } = await makeRenderer(4, 4);
      device.draw(
        rectDraw(device.generation, { x: 0, y: 0, width: 4, height: 2 }, RED),
      );
      device.draw(
        rectDraw(device.generation, { x: 0, y: 2, width: 4, height: 2 }, BLUE),
      );
      const scene = hooks.readScene();
      a.observe("sceneTop", pixelAt(scene, 0, 0));
      a.observe("sceneBottom", pixelAt(scene, 0, 3));
      a.observe("displayBeforePresent", readDisplayPixel(gl, 0, 0));
      await hooks.whenPresented(device.generation);
      // GL readback is bottom row first: (0,0) is the display bottom row.
      a.observe("displayBottomAfter", readDisplayPixel(gl, 0, 0));
      a.observe("displayTopAfter", readDisplayPixel(gl, 0, 3));
      device.draw(
        rectDraw(device.generation, { x: 0, y: 0, width: 1, height: 1 }, GREEN),
      );
      a.observe("sceneAfterExternalRead", pixelAt(hooks.readScene(), 0, 0));
      device.dispose();
    },
  },
  {
    id: "gpu.scene.cross-frame",
    requirements: ["CAN-05"],
    kind: "semantic",
    width: 32,
    height: 32,
    seed: 1,
    fonts: [],
    async run(a) {
      const { device, hooks } = await makeRenderer(4, 4);
      device.draw(
        rectDraw(device.generation, { x: 0, y: 0, width: 2, height: 4 }, RED),
      );
      await hooks.whenPresented(device.generation);
      await nextFrame();
      device.draw(
        rectDraw(device.generation, { x: 2, y: 0, width: 2, height: 4 }, BLUE),
      );
      const scene = hooks.readScene();
      a.observe("left", pixelAt(scene, 0, 0));
      a.observe("right", pixelAt(scene, 3, 0));
      device.dispose();
    },
  },
  {
    id: "gpu.scene.clear-operation",
    requirements: ["REN-01"],
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
      device.draw(
        clearOp(device.generation, { x: 1, y: 1, width: 2, height: 2 }),
      );
      const scene = hooks.readScene();
      a.observe("clearedCenter", pixelAt(scene, 1, 1));
      a.observe("keptCorner", pixelAt(scene, 0, 0));
      device.draw(
        clearOp(
          device.generation,
          { x: 0, y: 0, width: 2, height: 2 },
          [0, 1, -1, 0, 4, 0],
        ),
      );
      const rotated = hooks.readScene();
      a.observe("rotatedClear", pixelAt(rotated, 3, 1));
      a.observe("rotatedKept", pixelAt(rotated, 1, 3));
      device.dispose();
    },
  },
  {
    id: "gpu.scene.composite-blend",
    requirements: ["ACC-03"],
    kind: "semantic",
    width: 32,
    height: 32,
    seed: 1,
    fonts: [],
    async run(a) {
      for (const mode of [
        "source-over",
        "source-atop",
        "source-in",
        "lighter",
      ] as const) {
        const { device, hooks } = await makeRenderer(2, 1);
        device.draw(
          rectDraw(
            device.generation,
            { x: 0, y: 0, width: 1, height: 1 },
            mode === "lighter" ? [0, 0, 32 / 255, 1] : BLUE,
          ),
        );
        const top =
          mode === "lighter"
            ? ([64 / 255, 0, 0, 1] as const)
            : ([1, 0, 0, 128 / 255] as const);
        device.draw(
          rectDraw(
            device.generation,
            { x: 0, y: 0, width: 2, height: 1 },
            top,
            { composite: mode },
          ),
        );
        const scene = hooks.readScene();
        a.observe(`${mode}:overOpaque`, pixelAt(scene, 0, 0));
        a.observe(`${mode}:overTransparent`, pixelAt(scene, 1, 0));
        device.dispose();
      }
    },
  },
  {
    id: "gpu.resources.texture-lease",
    requirements: ["REN-02"],
    kind: "semantic",
    width: 32,
    height: 32,
    seed: 1,
    fonts: [],
    async run(a) {
      const { device, hooks } = await makeRenderer(4, 4);
      const source = makeRasterSource(
        2,
        2,
        { x: 0, y: 0, width: 4, height: 4 },
        (context) => {
          context.fillStyle = "#ff0000";
          context.fillRect(0, 0, 1, 2);
          context.fillStyle = "#0000ff";
          context.fillRect(1, 0, 1, 2);
        },
      );
      const counts = () => {
        const current = hooks.resourceCounts();
        return [current.textures, current.textureLeases];
      };
      const lease = device.acquireTexture(source);
      a.observe("afterAcquire", counts());
      const retained = device.retain(lease.handle);
      a.observe("afterRetain", counts());
      lease.release();
      a.observe("afterLeaseRelease", counts());
      device.draw(rasterDraw(device.generation, source));
      a.observe("afterDraw", counts());
      const scene = hooks.readScene();
      a.observe("rasterLeft", pixelAt(scene, 0, 0));
      a.observe("rasterRight", pixelAt(scene, 3, 0));
      source.release();
      source.release();
      retained.release();
      a.observe("afterFinalRelease", counts());
      const stale = device.acquireTexture(
        makeRasterSource(1, 1, { x: 0, y: 0, width: 1, height: 1 }, (context) =>
          context.fillRect(0, 0, 1, 1),
        ),
      );
      device.resize(4, 4);
      a.observe("afterResize", counts());
      stale.release();
      a.observe("afterStaleRelease", counts());
      a.observe(
        "staleRetain",
        captureError(() => device.retain(stale.handle))?.code ?? "no-error",
      );
      device.dispose();
    },
  },
  {
    id: "gpu.resources.pattern-bitmap-texture",
    requirements: ["REN-02"],
    kind: "semantic",
    width: 32,
    height: 32,
    seed: 1,
    fonts: [],
    async run(a) {
      const { gl, device, hooks } = await makeRenderer(4, 4);
      // A captured pattern bitmap uploads through the typed-array texImage2D
      // path (issue #37): NPOT 3x5 stays legal because wrap is CLAMP_TO_EDGE,
      // and the straight-alpha pixels premultiply under the same unpack
      // convention as DOM sources.
      const bitmap = await makePatternBitmap(3, 5, (x) => [
        x === 0 ? 255 : 0,
        x === 1 ? 255 : 0,
        x === 2 ? 255 : 0,
        255,
      ]);
      const counts = () => {
        const current = hooks.resourceCounts();
        return [current.textures, current.textureLeases];
      };
      a.observe("before", counts());
      const lease = device.acquireTexture(bitmap);
      a.observe("afterAcquire", counts());
      const retained = device.retain(lease.handle);
      lease.release();
      a.observe("afterLeaseRelease", counts());
      retained.release();
      a.observe("afterFinalRelease", counts());
      const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      const oversized = await makePatternBitmap(maxTextureSize + 1, 1, () => [
        0, 0, 0, 255,
      ]);
      a.observe(
        "oversizeCode",
        captureError(() => device.acquireTexture(oversized))?.code ??
          "no-error",
      );
      a.observe("afterOversize", counts());
      device.dispose();
    },
  },
];
