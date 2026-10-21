import type { CaseDefinition } from "../../types/testing.js";
import {
  dumpScene,
  hooksOf,
  displayPixel,
  pixelsEqual,
} from "../rect/helpers.js";
import { drawImage, fillSource, makeSourceCanvas } from "./helpers.js";

const base = {
  kind: "combined" as const,
  width: 32,
  height: 16,
  seed: 1,
  fonts: [] as string[],
  requirements: ["IMG-02", "context.drawImage"],
};
export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "IMG-02.same-task-mutations",
    async run(a) {
      const hooks = await hooksOf(a);
      const source = fillSource(
        makeSourceCanvas(8, 8, () => {}),
        "#ff0000",
      );
      drawImage(a.context, source, 0, 0);
      fillSource(source, "#00ff00");
      drawImage(a.context, source, 8, 0);
      fillSource(source, "#0000ff");
      if (hooks) await hooks.whenPresented(hooks.readScene().generation);
      a.assert(
        pixelsEqual(await displayPixel(a, 2, 2), [255, 0, 0, 255]),
        "display captures source at first draw",
      );
      a.assert(
        pixelsEqual(await displayPixel(a, 10, 2), [0, 255, 0, 255]),
        "display captures source at second draw",
      );
      const first = await dumpScene(a);
      a.assert(
        pixelsEqual(first.pixel(2, 2), [255, 0, 0, 255]) &&
          pixelsEqual(first.pixel(10, 2), [0, 255, 0, 255]),
        "post-operation source mutation cannot rewrite either sample",
      );
      await a.checkpoint();
      drawImage(a.context, source, 16, 0);
      fillSource(source, "#ffff00");
      drawImage(a.context, source, 24, 0);
      const second = await dumpScene(a);
      for (const [x, color] of [
        [2, [255, 0, 0, 255]],
        [10, [0, 255, 0, 255]],
        [18, [0, 0, 255, 255]],
        [26, [255, 255, 0, 255]],
      ] as const)
        a.assert(
          pixelsEqual(second.pixel(x, 2), color),
          "each frame retains all source time points",
        );
      if (
        hooks &&
        (hooks.resourceCounts().textures !== 0 ||
          hooks.resourceCounts().textureLeases !== 0)
      )
        throw new Error("external uploads retained operation leases");
    },
  },
  {
    ...base,
    id: "image.source-resize",
    async run(a) {
      const source = fillSource(
        makeSourceCanvas(4, 4, () => {}),
        "#ff0000",
      );
      drawImage(a.context, source, 0, 0);
      source.width = 8;
      source.height = 8;
      fillSource(source, "#0000ff");
      drawImage(a.context, source, 8, 0);
      const scene = await dumpScene(a);
      a.assert(
        pixelsEqual(scene.pixel(2, 2), [255, 0, 0, 255]),
        "resize does not modify prior destination",
      );
      a.assert(
        pixelsEqual(scene.pixel(15, 7), [0, 0, 255, 255]) &&
          scene.pixel(16, 7)[3] === 0,
        "next draw uses current source dimensions and pixels",
      );
    },
  },
];
