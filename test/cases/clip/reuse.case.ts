import type { CaseDefinition } from "../../types/testing.js";
import type { Bounds, ClipSnapshot } from "../../../src/internal/contracts.js";
import {
  RED,
  makeRasterSource,
  makeRenderer,
  pixelAt,
  rectDraw,
} from "../gpu/device-driver.js";

export const cases: CaseDefinition[] = [
  {
    id: "clip.reuses-effective-coverage-within-submission",
    kind: "semantic",
    requirements: ["context.clip", "ACC-03", "LIFE-01", "LIFE-02"],
    width: 4,
    height: 4,
    seed: 1,
    fonts: [],
    async run(a) {
      const r = await makeRenderer(4, 4);
      let masks = 0;
      let releases = 0;
      const makeClip = (id: number): ClipSnapshot => ({
        id,
        parent: null,
        path: { id, commands: [] },
        rule: "nonzero",
        mask: (bounds: Bounds) => {
          masks += 1;
          const source = makeRasterSource(
            bounds.width,
            bounds.height,
            bounds,
            (c) => {
              c.fillStyle = "white";
              c.fillRect(0.5, 0, bounds.width - 0.5, bounds.height);
            },
          );
          return {
            ...source,
            release: () => {
              releases += 1;
            },
          };
        },
      });
      const draw = (clip: ClipSnapshot | null) => {
        const op = rectDraw(
          r.device.generation,
          { x: 0, y: 0, width: 4, height: 4 },
          RED,
        );
        r.device.draw({ ...op, clip });
      };
      try {
        const clip = makeClip(1);
        for (let n = 0; n < 84; n += 1) draw(clip);
        a.assert(
          masks === 1,
          "84 draws with one clip rasterize/upload its coverage once",
        );
        a.assert(
          releases === masks,
          "native coverage sources are released synchronously",
        );
        a.assert(
          r.hooks.resourceCounts().textures === 1,
          "at most one coverage texture is retained",
        );
        a.assert(
          pixelAt(r.hooks.readScene(), 2, 2)[3] === 255,
          "reused coverage still draws",
        );
        // Identity matters even if another snapshot has the same numeric id.
        draw(makeClip(1));
        a.assert(
          masks === 2,
          "another snapshot replaces coverage instead of aliasing its id",
        );
        a.assert(
          r.hooks.resourceCounts().textures === 1,
          "replaced coverage is released",
        );
        draw(null);
        a.assert(
          r.hooks.resourceCounts().textures === 0,
          "unclipped draw releases coverage",
        );
        draw(clip);
        r.device.present(r.device.generation);
        a.assert(
          r.hooks.resourceCounts().textures === 0,
          "present releases retained coverage",
        );
        draw(clip);
        r.device.resize(4, 4);
        a.assert(
          r.hooks.resourceCounts().textures === 0,
          "same-size reset releases coverage",
        );
        draw(clip);
        r.device.lose();
        a.assert(
          r.hooks.resourceCounts().textures === 0,
          "loss releases retained coverage",
        );
        r.device.restore();
        draw(clip);
        a.assert(
          masks === 6,
          "present, reset and restore force fresh coverage",
        );
        r.device.dispose();
        a.assert(
          r.hooks.resourceCounts().textures === 0,
          "dispose releases retained coverage",
        );
        a.observe("coverage-reuse-and-invalidation", true);
      } finally {
        r.device.dispose();
      }
    },
  },
];
