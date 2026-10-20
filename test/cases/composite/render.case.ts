import type { CaseDefinition } from "../../types/testing.js";
import { displayPixel, dumpScene, hooksOf, pixelsEqual, TRANSPARENT } from "../rect/helpers.js";

const base = { kind: "combined" as const, width: 48, height: 48, seed: 1, fonts: [] as string[] };
const modes = ["source-over", "source-atop", "source-in", "lighter"] as const;
const alphas = [1, 128 / 255, 0] as const;

export const cases: CaseDefinition[] = [
  ...modes.map((mode): CaseDefinition => ({
    ...base,
    id: `context.globalCompositeOperation.render-${mode}`,
    requirements: ["context.globalCompositeOperation", "ACC-03"],
    kind: "render",
    async run(a) {
      const context = a.context;
      for (let target = 0; target < 3; target += 1) {
        for (let source = 0; source < 3; source += 1) {
          const x = source * 16;
          const y = target * 16;
          context.globalCompositeOperation = "source-over";
          context.fillStyle = `rgba(255,0,0,${alphas[target]})`;
          context.fillRect(x, y, 16, 16);
        }
      }
      const gradient = context.createLinearGradient(0, 0, 48, 0);
      for (let source = 0; source < 3; source += 1) {
        const start = source / 3;
        const end = (source + 1) / 3;
        gradient.addColorStop(start, `rgba(0,255,0,${alphas[source]})`);
        gradient.addColorStop(end, `rgba(0,255,0,${alphas[source]})`);
      }
      context.fillStyle = gradient;
      context.globalCompositeOperation = mode;
      context.fillRect(0, 0, 48, 48);
    },
  })),
  {
    ...base,
    id: "ACC-03.source-in-outside-source",
    requirements: ["ACC-03"],
    async run(a) {
      const context = a.context;
      const hooks = await hooksOf(a);
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 48, 48);
      context.globalCompositeOperation = "source-in";
      context.fillStyle = "#00ff00";
      context.fillRect(8, 8, 16, 16);
      if (hooks) await hooks.whenPresented(hooks.readScene().generation);
      a.assert(pixelsEqual(await displayPixel(a, 12, 12), [0, 255, 0, 255]), "source-in reaches default framebuffer");
      a.assert(pixelsEqual(await displayPixel(a, 40, 40), TRANSPARENT), "source-in clears source exterior on display");
      const scene = await dumpScene(a);
      a.assert(scene.count((p) => pixelsEqual(p, [0, 255, 0, 255])) === 256, "small source survives exactly once");
      a.assert(scene.count((p) => pixelsEqual(p, TRANSPARENT)) === 48 * 48 - 256, "all source exterior pixels clear");
    },
  },
  ...(["outside", "transparent", "alpha-zero", "raster-outside"] as const).map((variant): CaseDefinition => ({
    ...base,
    id: `composite.source-in.${variant}`,
    requirements: ["context.globalCompositeOperation", "ACC-03"],
    async run(a) {
      const context = a.context;
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 48, 48);
      context.globalCompositeOperation = "source-in";
      context.fillStyle = variant === "transparent" ? "rgba(0,255,0,0)" : "#00ff00";
      if (variant === "alpha-zero") context.globalAlpha = 0;
      if (variant === "raster-outside") context.strokeRect(-100, -100, 8, 8);
      else if (variant === "outside") context.fillRect(-100, -100, 8, 8);
      else context.fillRect(8, 8, 16, 16);
      const scene = await dumpScene(a);
      a.assert(scene.count((p) => pixelsEqual(p, TRANSPARENT)) === 48 * 48, `${variant} is an empty source, not a skipped operation`);
    },
  })),
  {
    ...base,
    id: "composite.source-in.no-op-and-stencil-reset",
    requirements: ["context.globalCompositeOperation", "context.fillRect"],
    async run(a) {
      const context = a.context;
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 48, 48);
      context.globalCompositeOperation = "source-in";
      context.fillRect(4, 4, 0, 0);
      context.fillRect(NaN, 4, 8, 8);
      const unchanged = await dumpScene(a);
      a.assert(unchanged.count((p) => pixelsEqual(p, [255, 0, 0, 255])) === 48 * 48, "invalid and point calls do not composite");
      context.fillRect(4, 4, 0, 8);
      const empty = await dumpScene(a);
      a.assert(empty.count((p) => pixelsEqual(p, TRANSPARENT)) === 48 * 48, "one zero extent still composites an empty source");
      context.globalCompositeOperation = "source-over";
      context.fillRect(0, 0, 48, 48);
      context.globalCompositeOperation = "source-in";
      context.fillStyle = "#00ff00";
      context.fillRect(4, 4, 24, 24);
      context.fillStyle = "#0000ff";
      context.fillRect(12, 12, 24, 24);
      context.globalCompositeOperation = "source-over";
      context.fillStyle = "#ffffff";
      context.fillRect(40, 40, 4, 4);
      const scene = await dumpScene(a);
      a.assert(scene.count((p) => pixelsEqual(p, [0, 0, 255, 255])) === 16 * 16, "second source-in intersects prior content with fresh stencil");
      a.assert(pixelsEqual(scene.pixel(6, 6), TRANSPARENT), "old stencil coverage does not survive");
      a.assert(pixelsEqual(scene.pixel(41, 41), [255, 255, 255, 255]), "subsequent source-over has normal GL state");
    },
  },
  ...modes.map((mode): CaseDefinition => ({
    ...base,
    id: `composite.raster-unit.${mode}`,
    requirements: ["context.globalCompositeOperation", "context.strokeRect"],
    async run(a) {
      const context = a.context;
      context.fillStyle = "#0000ff";
      context.fillRect(0, 0, 48, 48);
      context.globalCompositeOperation = mode;
      context.strokeStyle = "rgba(255,0,0,0.5)";
      context.lineWidth = 8;
      context.strokeRect(12, 12, 24, 24);
      const scene = await dumpScene(a);
      const expected = mode === "source-in" ? [255, 0, 0, 128] as const : mode === "lighter" ? [128, 0, 255, 255] as const : [128, 0, 127, 255] as const;
      a.assert(pixelsEqual(scene.pixel(12, 12), expected), "raster corner composites once");
      a.assert(pixelsEqual(scene.pixel(24, 12), expected), "raster edge has same opacity as corner");
      a.assert(pixelsEqual(scene.pixel(24, 24), mode === "source-in" ? TRANSPARENT : [0, 0, 255, 255]), "transparent raster interior participates in operation");
    },
  })),
  {
    ...base,
    id: "composite.clear-independent",
    requirements: ["context.clearRect", "context.filter", "context.globalCompositeOperation"],
    async run(a) {
      const context = a.context;
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 48, 48);
      context.globalCompositeOperation = "source-in";
      context.filter = "brightness(120%)";
      context.globalAlpha = 0;
      context.clearRect(8, 8, 16, 16);
      const scene = await dumpScene(a);
      a.assert(scene.count((p) => pixelsEqual(p, TRANSPARENT)) === 256, "clear geometry ignores alpha/filter/composite");
      a.assert(scene.count((p) => pixelsEqual(p, [255, 0, 0, 255])) === 48 * 48 - 256, "clear keeps exterior destination");
    },
  },
  ...(["none", "brightness(120%)"] as const).map((filter): CaseDefinition => ({
    ...base,
    id: `context.filter.render-${encodeURIComponent(filter)}`,
    requirements: ["context.filter"],
    async run(a) {
      const context = a.context;
      context.filter = filter;
      context.fillStyle = "#646464";
      context.fillRect(0, 0, 16, 48);
      context.fillStyle = "#c8c8c8";
      context.fillRect(16, 0, 16, 48);
      context.fillStyle = "#fafafa";
      context.fillRect(32, 0, 16, 48);
      const scene = await dumpScene(a);
      const expected = filter === "none" ? [100, 200, 250] : [120, 240, 255];
      for (let i = 0; i < 3; i += 1) {
        const channel = expected[i]!;
        a.assert(pixelsEqual(scene.pixel(i * 16 + 8, 24), [channel, channel, channel, 255]), "brightness transfer and color clamp");
      }
    },
  })),
  {
    ...base,
    id: "ACC-03.brightness-alpha",
    requirements: ["ACC-03"],
    kind: "render",
    run(a) {
      const context = a.context;
      context.fillStyle = "#000000";
      context.fillRect(0, 0, 24, 48);
      context.filter = "brightness(120%)";
      context.globalAlpha = 0.5;
      context.fillStyle = "#fafafa";
      context.fillRect(0, 0, 24, 24);
      context.fillStyle = "#c8c8c8";
      context.fillRect(0, 24, 24, 24);
      context.globalAlpha = 1;
      context.fillStyle = "rgba(200,100,50,0.5)";
      context.fillRect(24, 0, 24, 24);
      context.fillStyle = "#808080";
      context.fillRect(24, 24, 24, 24);
    },
  },
  {
    ...base,
    id: "composite.source-in.transformed-edges",
    requirements: ["context.globalCompositeOperation", "context.rotate", "context.fillRect"],
    kind: "render",
    run(a) {
      const context = a.context;
      context.fillStyle = "rgba(255,0,0,0.5)";
      context.fillRect(0, 0, 48, 48);
      context.translate(24, 24);
      context.rotate(Math.PI / 6);
      context.globalCompositeOperation = "source-in";
      context.fillStyle = "rgba(0,255,0,0.5)";
      context.fillRect(-12.5, -12.5, 25, 25);
    },
  },
  {
    ...base,
    id: "composite.brightness-raster-save-restore",
    requirements: ["context.filter", "context.save", "context.restore", "context.strokeRect"],
    async run(a) {
      const context = a.context;
      context.filter = "brightness(120%)";
      context.save();
      context.filter = "none";
      context.fillStyle = "#646464";
      context.fillRect(0, 0, 16, 48);
      context.restore();
      context.strokeStyle = "#646464";
      context.lineWidth = 8;
      context.strokeRect(24, 8, 16, 32);
      const scene = await dumpScene(a);
      a.assert(pixelsEqual(scene.pixel(8, 24), [100, 100, 100, 255]), "none is identity");
      a.assert(pixelsEqual(scene.pixel(24, 16), [120, 120, 120, 255]), "restored brightness applies to raster source");
    },
  },
];
