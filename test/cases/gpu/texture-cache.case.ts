import type { CaseDefinition } from "../../types/testing.js";
import type { RasterSource } from "../../../src/internal/contracts.js";
import { makeRasterSource, makeRenderer, rasterDraw } from "./device-driver.js";

async function loadCache() {
  return (await import(
    new URL("../../../../dist/gpu/texture-cache.js", import.meta.url).href
  )) as typeof import("../../../src/gpu/texture-cache.js");
}

function source(width: number): RasterSource {
  return makeRasterSource(width, 1, { x: 0, y: 0, width, height: 1 }, (ctx) => {
    ctx.fillStyle = "red";
    ctx.fillRect(0, 0, width, 1);
  });
}

const createCanvas = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

export const cases: CaseDefinition[] = [
  {
    id: "gpu.cache.transient-texture-release",
    requirements: ["REN-02", "LIFE-01"],
    kind: "semantic",
    width: 4,
    height: 4,
    seed: 1,
    fonts: [],
    async run(a) {
      const { gl, device, hooks } = await makeRenderer(4, 4, { createCanvas });
      const { TextureCache } = await loadCache();
      const acquire = TextureCache.prototype.acquire;
      // The real device fallback needs a source wider than its 2048px atlas.
      // Lower only the test cache's budget to exercise transient ownership
      // with an 8KB source instead of allocating a >64MB bitmap.
      const cache = new TextureCache(
        gl,
        gl.getParameter(gl.MAX_TEXTURE_SIZE),
        1,
        1,
      );
      const createTexture = gl.createTexture.bind(gl);
      const deleteTexture = gl.deleteTexture.bind(gl);
      const drawArrays = gl.drawArrays.bind(gl);
      const live = new Set<WebGLTexture>();
      const failure = Error("injected cached draw failure");
      const raster = source(2049);
      TextureCache.prototype.acquire = function (raster) {
        return acquire.call(cache, raster);
      };
      gl.createTexture = () => {
        const texture = createTexture();
        if (texture) live.add(texture);
        return texture;
      };
      gl.deleteTexture = (texture) => {
        if (texture) live.delete(texture);
        deleteTexture(texture);
      };
      try {
        device.draw(rasterDraw(device.generation, raster));
        a.assert(
          live.size === 0,
          "successful uncached raster draw releases its texture",
        );
        await hooks.whenPresented(device.generation);
        gl.drawArrays = () => {
          throw failure;
        };
        let thrown: unknown;
        try {
          device.draw(rasterDraw(device.generation, raster));
        } catch (error) {
          thrown = error;
        }
        a.assert(
          thrown === failure,
          "cached draw reports the original drawing failure",
        );
        a.assert(
          live.size === 0,
          "failed uncached raster draw releases its texture",
        );
      } finally {
        TextureCache.prototype.acquire = acquire;
        gl.createTexture = createTexture;
        gl.deleteTexture = deleteTexture;
        gl.drawArrays = drawArrays;
        cache.clear();
        device.dispose();
        raster.canvas.width = raster.canvas.height = 0;
      }
    },
  },
  {
    id: "gpu.cache.preserves-stream-failure",
    requirements: ["REN-02"],
    kind: "semantic",
    width: 4,
    height: 4,
    seed: 1,
    fonts: [],
    async run(a) {
      const { gl, device, hooks } = await makeRenderer(4, 4, { createCanvas });
      const getError = gl.getError.bind(gl);
      const subImage = gl.texSubImage2D.bind(gl);
      let pending = false;
      gl.texSubImage2D = ((...args: unknown[]) => {
        (subImage as (...args: unknown[]) => void)(...args);
        pending = true;
      }) as WebGLRenderingContext["texSubImage2D"];
      gl.getError = () => {
        if (pending) {
          pending = false;
          return gl.OUT_OF_MEMORY;
        }
        return getError();
      };
      const small = source(2),
        large = source(2049);
      try {
        device.draw(rasterDraw(device.generation, small));
        let thrown: unknown;
        try {
          device.draw(rasterDraw(device.generation, large));
        } catch (error) {
          thrown = error;
        }
        a.assert(
          thrown instanceof Error,
          "cache fallback exposes the preceding stream failure",
        );
        const outcome = await hooks.whenPresented(device.generation).then(
          () => "resolved",
          () => "rejected",
        );
        a.assert(
          outcome === "rejected",
          "cache status checks cannot consume a failed upload and resolve presentation",
        );
      } finally {
        gl.getError = getError;
        gl.texSubImage2D = subImage;
        device.dispose();
        small.canvas.width = small.canvas.height = 0;
        large.canvas.width = large.canvas.height = 0;
      }
    },
  },
];
