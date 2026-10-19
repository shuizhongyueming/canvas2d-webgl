import type { CaseDefinition } from "../../types/testing.js";
import { errorInfo, callRaw, loadImage, STRIPES_3x5 } from "./fixtures.js";

type Ctx = CanvasRenderingContext2D;
const asNative = (context: unknown): Ctx => context as Ctx;
const assignFill = (context: Ctx, value: unknown): void => {
  (context as unknown as Record<string, unknown>).fillStyle = value;
};

const base = {
  kind: "semantic" as const,
  width: 16,
  height: 16,
  seed: 1,
  fonts: [],
};
const renderBase = {
  kind: "render" as const,
  width: 64,
  height: 64,
  seed: 1,
  fonts: [],
};

export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "context.createPattern.contract",
    requirements: ["context.createPattern"],
    async run(a) {
      const context = asNative(a.context);
      const image = await loadImage(STRIPES_3x5);
      const pattern = context.createPattern(image, "repeat");
      a.assert(pattern !== null, "repeat pattern created");
      assignFill(context, pattern);
      a.observe("identity", context.fillStyle === pattern);
    },
  },
  {
    ...base,
    id: "context.createPattern.arity-2",
    requirements: ["context.createPattern"],
    async run(a) {
      const context = asNative(a.context);
      const image = await loadImage(STRIPES_3x5);
      a.observe("two", errorInfo(() => context.createPattern(image, "repeat")));
      a.observe(
        "one",
        errorInfo(() => callRaw(context, "createPattern", image)),
      );
      a.observe("zero", errorInfo(() => callRaw(context, "createPattern")));
    },
  },
  {
    ...base,
    id: "context.createPattern.source-HTMLImageElement",
    requirements: ["context.createPattern"],
    async run(a) {
      const image = await loadImage(STRIPES_3x5);
      const pattern = asNative(a.context).createPattern(image, "repeat");
      a.assert(pattern !== null, "HTMLImageElement source accepted");
      a.observe("created", pattern !== null);
    },
  },
  {
    ...base,
    id: "context.createPattern.value-repeat",
    requirements: ["context.createPattern"],
    async run(a) {
      const context = asNative(a.context);
      const image = await loadImage(STRIPES_3x5);
      a.observe("repeat", errorInfo(() => context.createPattern(image, "repeat")));
      a.observe("empty", errorInfo(() => context.createPattern(image, "")));
      a.observe(
        "null",
        errorInfo(() => callRaw(context, "createPattern", image, null)),
      );
    },
  },
  {
    ...base,
    id: "pattern.setTransform.contract",
    requirements: ["pattern.setTransform"],
    async run(a) {
      const context = asNative(a.context);
      const image = await loadImage(STRIPES_3x5);
      const pattern = context.createPattern(image, "repeat")!;
      let reported: string | null = null;
      try {
        (pattern as CanvasPattern).setTransform();
        reported = "called";
      } catch (error) {
        reported = String((error as { code?: unknown })?.code ?? "thrown");
      }
      // Native: the method exists and runs. Compat: explicit unsupported-api.
      a.assert(
        reported === "called" || reported === "unsupported-api",
        `setTransform reports a sanctioned outcome, got ${reported}`,
      );
    },
  },
  {
    ...base,
    id: "paint.pattern.invalid-repetition",
    requirements: ["context.createPattern"],
    async run(a) {
      const context = asNative(a.context);
      const image = await loadImage(STRIPES_3x5);
      a.observe("bogus", errorInfo(() => context.createPattern(image, "bogus")));
      a.observe("case", errorInfo(() => context.createPattern(image, "REPEAT")));
      a.observe(
        "undefined",
        errorInfo(() => callRaw(context, "createPattern", image, undefined)),
      );
      a.assert(true, "error identities recorded");
    },
  },
  {
    ...base,
    id: "paint.pattern.unsupported-repetition",
    requirements: ["context.createPattern"],
    async run(a) {
      const context = asNative(a.context);
      const image = await loadImage(STRIPES_3x5);
      for (const mode of ["repeat-x", "repeat-y", "no-repeat"]) {
        let reported: string | null = null;
        try {
          context.createPattern(image, mode);
        } catch (error) {
          reported = String((error as { code?: unknown })?.code);
        }
        if (reported === null) {
          a.assert(true, `native accepts ${mode}`);
        } else {
          a.assert(
            reported === "unsupported-api",
            `${mode} reports unsupported-api, got ${reported}`,
          );
        }
      }
    },
  },
  {
    ...base,
    id: "paint.pattern.reject-canvas-source",
    requirements: ["context.createPattern"],
    run(a) {
      const context = asNative(a.context);
      const source = document.createElement("canvas");
      source.width = 3;
      source.height = 5;
      let reported: string | null = null;
      try {
        context.createPattern(source, "repeat");
      } catch (error) {
        reported = String((error as { code?: unknown })?.code);
      }
      // Native accepts canvas sources; the support matrix excludes them, so
      // the compat side must report unsupported-api instead.
      a.assert(
        reported === null || reported === "unsupported-api",
        `canvas source outcome sanctioned, got ${reported}`,
      );
    },
  },
  {
    ...base,
    id: "paint.pattern.image-states",
    requirements: ["context.createPattern"],
    async run(a) {
      const context = asNative(a.context);
      const pending = new Image();
      a.observe(
        "pending",
        errorInfo(() => context.createPattern(pending, "repeat")),
      );
      const broken = new Image();
      await new Promise((resolve) => {
        broken.onerror = resolve;
        broken.src = "data:image/png;base64,bogus";
      });
      a.observe("broken", errorInfo(() => context.createPattern(broken, "repeat")));
      // Repetition validates before usability, on both sides.
      a.observe(
        "pendingBadRep",
        errorInfo(() => context.createPattern(pending, "bogus")),
      );
    },
  },
  {
    ...renderBase,
    id: "paint.pattern.npot-phase",
    requirements: ["context.createPattern", "context.translate"],
    async run(a) {
      const context = asNative(a.context);
      const pattern = context.createPattern(await loadImage(STRIPES_3x5), "repeat");
      context.translate(1, 0);
      assignFill(context, pattern);
      context.fillRect(0, 0, 24, 24);
      // Native truth: the tile phase shifts with the draw-time transform.
    },
  },
  {
    ...renderBase,
    id: "paint.pattern.npot-scale",
    requirements: ["context.createPattern", "context.scale"],
    async run(a) {
      const context = asNative(a.context);
      const pattern = context.createPattern(await loadImage(STRIPES_3x5), "repeat");
      context.scale(2, 3);
      assignFill(context, pattern);
      context.fillRect(0, 0, 24, 16);
    },
  },
  {
    ...renderBase,
    id: "paint.pattern.npot-rotate",
    requirements: ["context.createPattern", "context.rotate"],
    async run(a) {
      const context = asNative(a.context);
      const pattern = context.createPattern(await loadImage(STRIPES_3x5), "repeat");
      context.translate(32, 32);
      context.rotate(Math.PI / 6);
      assignFill(context, pattern);
      context.fillRect(-32, -32, 64, 64);
    },
  },
  {
    ...renderBase,
    id: "paint.pattern.npot-edge",
    requirements: ["context.createPattern", "context.fillRect"],
    async run(a) {
      const context = asNative(a.context);
      const pattern = context.createPattern(await loadImage(STRIPES_3x5), "repeat");
      assignFill(context, pattern);
      // Rect edges exactly on tile boundaries (multiples of 3 and 5) and
      // straddling partial tiles, to expose wrap seams and phase offsets.
      context.fillRect(0, 0, 12, 10);
      context.fillRect(13, 11, 9, 9);
      context.fillRect(30.5, 20, 15, 15);
    },
  },
];
