import type { CaseDefinition } from "../../types/testing.js";
import type {
  ClipSnapshot,
  DrawOperation,
  RasterSource,
} from "../../../src/internal/contracts.js";
import {
  IDENTITY,
  RED,
  drawState,
  makeRenderer,
  pixelAt,
  rectDraw,
} from "../gpu/device-driver.js";

const base = {
  kind: "semantic" as const,
  width: 4,
  height: 4,
  seed: 1,
  fonts: [] as string[],
};

/** One opaque 4x4 mask, reused by every level; release is caller-owned. */
function fullMask(): RasterSource {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 4;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2d context unavailable for the clip mask");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 4, 4);
  return {
    kind: "raster",
    canvas,
    bounds: { x: 0, y: 0, width: 4, height: 4 },
    pixelWidth: 4,
    pixelHeight: 4,
    colorSpace: "srgb",
    alpha: "straight",
    release() {
      /* the fixture owns the canvas */
    },
  };
}

function clipChain(depth: number, mask: RasterSource): ClipSnapshot {
  let parent: ClipSnapshot | null = null;
  for (let level = 0; level < depth; level += 1) {
    parent = {
      id: level + 1,
      parent,
      path: { id: level + 1, commands: [] },
      rule: "nonzero",
      mask: () => mask,
    };
  }
  if (!parent) throw new Error("clip chain needs at least one level");
  return parent;
}

function drawClipped(device: {
  generation: number;
}, clip: ClipSnapshot): DrawOperation {
  return {
    ...rectDraw(device.generation, { x: 0, y: 0, width: 4, height: 4 }, RED),
    state: drawState({ clip }),
    clip,
  };
}

export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "clip.depth-boundary",
    requirements: ["context.clip", "ACC-03"],
    async run(a) {
      const renderer = await makeRenderer(4, 4);
      const mask = fullMask();
      try {
        // STENCIL_INDEX8 leaves 255 nesting values once 0 marks "outside".
        const deepest = clipChain(255, mask);
        renderer.device.draw(drawClipped(renderer.device, deepest));
        const scene = renderer.hooks.readScene();
        a.assert(
          pixelAt(scene, 1, 1).join(",") === "255,0,0,255",
          "255 nested clips still draw through every level",
        );
        a.observe("deepestOpacity", pixelAt(scene, 1, 1));
        // Every mask texture lease must be released within the draw.
        const counts = renderer.hooks.resourceCounts();
        a.observe("texturesAfterDeepest", counts.textures);
        a.assert(
          counts.textures === 0,
          "clip mask textures are released after the draw",
        );
        // One level beyond the representable values fails explicitly instead
        // of wrapping the stencil counter.
        const tooDeep = clipChain(256, mask);
        let code = "ok";
        try {
          renderer.device.draw(drawClipped(renderer.device, tooDeep));
        } catch (error) {
          code = (error as { code?: string }).code ?? "unknown";
        }
        a.observe("beyondBoundary", code);
        a.assert(
          code === "resource-limit",
          "256 nested clips report resource-limit",
        );
        const unchanged = renderer.hooks.readScene();
        a.assert(
          pixelAt(unchanged, 1, 1).join(",") === "255,0,0,255",
          "the rejected draw does not alter the scene",
        );
      } finally {
        renderer.device.dispose();
      }
    },
  },
];
