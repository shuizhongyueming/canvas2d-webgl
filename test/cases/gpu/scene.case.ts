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

/** Exact byte-pixel comparison for expected-value assertions. */
function pixelIs(
  actual: readonly number[],
  expected: readonly number[],
): boolean {
  return actual.every((channel, index) => channel === expected[index]);
}

export const cases: CaseDefinition[] = [
  {
    id: "gpu.scene.raster-texture-cache",
    requirements: ["REN-02", "LIFE-01", "LIFE-02"],
    kind: "semantic",
    width: 32,
    height: 32,
    seed: 1,
    fonts: [],
    async run(a) {
      const { gl, device, hooks } = await makeRenderer(4, 4, {
        createCanvas(width, height) {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          return canvas;
        },
      });
      const original = gl.texImage2D.bind(gl);
      const originalSubImage = gl.texSubImage2D.bind(gl);
      let uploads = 0;
      gl.texImage2D = ((...args: unknown[]) => {
        if (args.length === 6) uploads += 1;
        return (original as (...args: unknown[]) => void).apply(gl, args);
      }) as WebGLRenderingContext["texImage2D"];
      gl.texSubImage2D = ((...args: unknown[]) => {
        uploads += 1;
        return (originalSubImage as (...args: unknown[]) => void).apply(
          gl,
          args,
        );
      }) as WebGLRenderingContext["texSubImage2D"];
      try {
        const source = makeRasterSource(
          4,
          4,
          { x: 0, y: 0, width: 4, height: 4 },
          (context) => {
            context.fillStyle = "#ff0000";
            context.fillRect(0, 0, 4, 4);
          },
        );
        device.draw(rasterDraw(device.generation, source));
        device.draw(rasterDraw(device.generation, source));
        a.assert(gl.getError() === gl.NO_ERROR, "cached draw has no GL error");
        // The device consumes native bitmaps synchronously. Releasing the
        // source before present must not lose what the batch already captured.
        source.canvas.width = source.canvas.height = 0;
        const captured = hooks.readScene();
        a.assert(
          gl.getError() === gl.NO_ERROR,
          "bitmap release does not affect the captured batch",
        );
        a.assert(
          uploads === 1,
          `repeated immutable rasters share one batch upload (got ${uploads})`,
        );
        a.assert(
          pixelIs(pixelAt(captured, 1, 1), [255, 0, 0, 255]),
          "captured batch remains valid after native bitmap release",
        );
        device.resize(4, 4);
        source.canvas.width = source.canvas.height = 4;
        const context = source.canvas.getContext("2d")!;
        context.fillStyle = "#ff0000";
        context.fillRect(0, 0, 4, 4);
        device.draw(rasterDraw(device.generation, source));
        const resized = hooks.readScene();
        a.assert(uploads === 2, "resize reuploads the captured raster");
        a.assert(
          pixelIs(pixelAt(resized, 1, 1), [255, 0, 0, 255]),
          "resized batch renders the captured source",
        );
        device.lose();
        device.restore();
        device.draw(rasterDraw(device.generation, source));
        const restored = hooks.readScene();
        a.assert(
          uploads === 3,
          "context restoration reuploads the immutable raster",
        );
        a.assert(
          pixelIs(pixelAt(restored, 1, 1), [255, 0, 0, 255]),
          "restored texture renders the captured source",
        );
      } finally {
        gl.texImage2D = original;
        gl.texSubImage2D = originalSubImage;
        device.dispose();
      }
    },
  },
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
        rectDraw(device.generation, { x: 4, y: 0, width: 4, height: 3 }, [
          1,
          0,
          0,
          128 / 255,
        ]),
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
      a.assert(
        pixelIs(pixelAt(scene, 0, 0), [255, 0, 0, 255]),
        "scene top row is the red half",
      );
      a.assert(
        pixelIs(pixelAt(scene, 0, 3), [0, 0, 255, 255]),
        "scene bottom row is the blue half",
      );
      a.assert(
        pixelIs(readDisplayPixel(gl, 0, 0), [0, 0, 0, 0]),
        "display stays transparent before the first present",
      );
      await hooks.whenPresented(device.generation);
      // GL readback is bottom row first: (0,0) is the display bottom row.
      // Expected values, not self-observation: a vertically flipped present
      // blit swaps these two rows and fails both assertions.
      a.assert(
        pixelIs(readDisplayPixel(gl, 0, 0), [0, 0, 255, 255]),
        "display bottom row shows the blue scene half, unflipped",
      );
      a.assert(
        pixelIs(readDisplayPixel(gl, 0, 3), [255, 0, 0, 255]),
        "display top row shows the red scene half, unflipped",
      );
      device.draw(
        rectDraw(device.generation, { x: 0, y: 0, width: 1, height: 1 }, GREEN),
      );
      a.assert(
        pixelIs(pixelAt(hooks.readScene(), 0, 0), [0, 255, 0, 255]),
        "scene writes still land after the external display read",
      );
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
