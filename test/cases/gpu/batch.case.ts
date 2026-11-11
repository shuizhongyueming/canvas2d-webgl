import type { CaseDefinition } from "../../types/testing.js";
import type { DrawOperation } from "../../../src/internal/contracts.js";
import { drawState, IDENTITY, makeRenderer, pixelAt } from "./device-driver.js";

export const cases: CaseDefinition[] = [
  {
    id: "gpu.batch.source-order-reset-and-release",
    kind: "semantic",
    requirements: ["IMG-02", "REN-02", "LIFE-01", "LIFE-02"],
    width: 16,
    height: 8,
    seed: 1,
    fonts: [],
    async run(a) {
      const created: HTMLCanvasElement[] = [];
      const r = await makeRenderer(16, 8, {
        createCanvas(width, height) {
          const c = document.createElement("canvas");
          c.width = width;
          c.height = height;
          created.push(c);
          return c;
        },
      });
      const source = document.createElement("canvas");
      source.width = source.height = 4;
      const c = source.getContext("2d")!;
      const fill = (color: string) => {
        c.fillStyle = color;
        c.fillRect(0, 0, source.width, source.height);
      };
      const draw = (x: number) => {
        const bounds = { x, y: 0, width: 4, height: 4 };
        const op: DrawOperation = {
          generation: r.device.generation,
          kind: "draw",
          state: drawState(),
          source: {
            kind: "image",
            image: source,
            sourceRect: {
              x: 0,
              y: 0,
              width: source.width,
              height: source.height,
            },
            destinationRect: bounds,
            transform: IDENTITY,
          },
          sourceBounds: bounds,
          clip: null,
        };
        r.device.draw(op);
      };
      const assertPixel = (x: number, color: string) =>
        a.assert(
          pixelAt(r.hooks.readScene(), x, 1).join(",") === color,
          `captured pixel at ${x} is ${color}`,
        );
      try {
        fill("red");
        draw(0);
        fill("lime");
        draw(4);
        source.width = 2;
        source.height = 2;
        fill("blue");
        // readScene must flush the batch before observing the scene.
        assertPixel(1, "255,0,0,255");
        assertPixel(5, "0,255,0,255");
        draw(8);
        fill("yellow");
        await r.hooks.whenPresented(r.device.generation);
        assertPixel(9, "0,0,255,255");
        a.assert(
          r.hooks.resourceCounts().uploadTextures! <= 2,
          "upload buffers remain bounded",
        );
        // Capacity flushes must retain source snapshots and operation order.
        for (let i = 0; i < 300; i += 1) {
          fill(i % 2 ? "red" : "blue");
          draw(0);
        }
        fill("lime");
        assertPixel(1, "255,0,0,255");
        draw(12);
        r.device.resize(16, 8);
        a.assert(
          r.hooks.readScene().pixels.every((v) => v === 0),
          "same-size reset discards pending captures",
        );
        a.assert(
          r.hooks.resourceCounts().uploadTextures === 0,
          "reset releases upload buffers",
        );
        draw(0);
        r.device.lose();
        r.device.restore();
        a.assert(
          r.hooks.readScene().pixels.every((v) => v === 0),
          "loss discards pending captures before restore",
        );
        draw(0);
        r.hooks.readScene();
        r.device.dispose();
        a.assert(
          r.hooks.resourceCounts().uploadTextures === 0,
          "dispose releases upload buffers",
        );
        a.assert(
          created.every((c) => c.width === 0 && c.height === 0),
          "dispose releases atlas and origin probe canvases",
        );
        a.observe("batch-source-order-and-lifetime", true);
      } finally {
        r.device.dispose();
      }
    },
  },
];
