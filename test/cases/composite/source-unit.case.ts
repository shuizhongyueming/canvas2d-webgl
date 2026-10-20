import type { CaseDefinition } from "../../types/testing.js";
import type { createRasterizer } from "../../../src/raster/rasterizer.js";
import type { PathRecorder } from "../../../src/path/recorder.js";
import { drawState, IDENTITY, makeRenderer, pixelAt, rasterDraw, rectDraw } from "../gpu/device-driver.js";

export const cases: CaseDefinition[] = [{
  id: "composite.device.operation-source-types",
  requirements: ["ACC-03"],
  kind: "semantic",
  width: 32,
  height: 32,
  seed: 1,
  fonts: [],
  async run(a) {
    const rasterModule = await import(new URL("../../../../dist/raster/rasterizer.js", import.meta.url).href) as { createRasterizer: typeof createRasterizer };
    const pathModule = await import(new URL("../../../../dist/path/recorder.js", import.meta.url).href) as { PathRecorder: typeof PathRecorder };
    const createCanvas = (width: number, height: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    };
    const raster = rasterModule.createRasterizer({ createCanvas, sceneExtent: () => ({ width: 32, height: 32 }) });
    const path = new pathModule.PathRecorder();
    path.rect(4, 4, 16, 16, IDENTITY);
    path.rect(12, 4, 16, 16, IDENTITY);
    try {
      for (const kind of ["raster-overlap", "image"] as const) {
        for (const mode of ["source-over", "source-atop", "source-in", "lighter"] as const) {
          const { device, hooks } = await makeRenderer(32, 32);
          try {
            const state = drawState({ composite: mode, fill: { kind: "solid", color: [1, 0, 0, 128 / 255] } });
            device.draw(rectDraw(device.generation, { x: 0, y: 0, width: 32, height: 32 }, [0, 0, 1, 1]));
            const reference = createCanvas(32, 32).getContext("2d")!;
            reference.fillStyle = "#0000ff";
            reference.fillRect(0, 0, 32, 32);
            reference.globalCompositeOperation = mode;
            reference.fillStyle = "rgba(255,0,0,0.5)";
            if (kind === "raster-overlap") {
              reference.beginPath();
              reference.rect(4, 4, 16, 16);
              reference.rect(12, 4, 16, 16);
              reference.fill();
              const source = raster.path(path.snapshot(), state, "fill");
              try { device.draw(rasterDraw(device.generation, source, state)); }
              finally { source.release(); }
            } else {
              const image = createCanvas(24, 16);
              const context = image.getContext("2d")!;
              context.fillStyle = "rgba(255,0,0,0.5)";
              context.fillRect(0, 0, 24, 16);
              context.clearRect(8, 4, 8, 8);
              reference.drawImage(image, 4, 4);
              device.draw({
                generation: device.generation, kind: "draw", state,
                source: { kind: "image", image, sourceRect: { x: 0, y: 0, width: 24, height: 16 }, destinationRect: { x: 4, y: 4, width: 24, height: 16 }, transform: IDENTITY },
                sourceBounds: { x: 4, y: 4, width: 24, height: 16 }, clip: null,
              });
            }
            const scene = hooks.readScene();
            const native = reference.getImageData(0, 0, 32, 32).data;
            a.assert(scene.pixels.every((byte, index) => byte === native[index]), `${kind}/${mode} matches native across every pixel`);
            if (kind === "raster-overlap")
              a.assert(pixelAt(scene, 8, 8).every((byte, index) => byte === pixelAt(scene, 16, 8)[index]), "overlapping subpaths compose as one source");
          } finally { device.dispose(); }
        }
      }
    } finally { raster.dispose(); }
    a.observe("scope", "device-and-raster-module; public path/image integration belongs to #19/#18");
  },
}];
