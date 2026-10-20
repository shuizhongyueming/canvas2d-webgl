import type { CaseDefinition } from "../../types/testing.js";
import {
  errorInfo,
  callRaw,
  loadImage,
  STRIPES_3x5,
  YELLOW_BLACK_3x5,
} from "./fixtures.js";
import { isCompat, outcome } from "../shared.js";

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
    id: "context.createPattern.source-CORS-clean-HTMLImageElement",
    requirements: ["context.createPattern"],
    async run(a) {
      const image = await loadImage(STRIPES_3x5);
      const pattern = asNative(a.context).createPattern(image, "repeat");
      a.assert(pattern !== null, "CORS-clean HTMLImageElement source accepted");
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
      // Native: the method exists and runs. Compat: explicit unsupported-api.
      const result = outcome(() => {
        (pattern as CanvasPattern).setTransform();
      });
      const expected = isCompat(a) ? "unsupported-api" : "ok";
      a.assert(result === expected, "setTransform follows approved semantics");
      a.observe("setTransform", result === expected ? "as-approved" : result);
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
        const result = outcome(() => {
          context.createPattern(image, mode);
        });
        // Native accepts every legal repetition; compat only supports repeat.
        const expected = isCompat(a) ? "unsupported-api" : "ok";
        a.assert(result === expected, `${mode} follows approved semantics`);
        a.observe(mode, result === expected ? "as-approved" : result);
      }
    },
  },
  {
    ...base,
    id: "paint.pattern.reject-non-branded-sources",
    requirements: ["context.createPattern"],
    run(a) {
      const context = asNative(a.context);
      // Native rejects all three with a TypeError: duck-typed objects are not
      // image sources, and ImageData is absent from the source union.
      a.observe(
        "plainObject",
        errorInfo(() =>
          callRaw(
            context,
            "createPattern",
            { complete: true, naturalWidth: 3, naturalHeight: 5 },
            "repeat",
          ),
        ),
      );
      a.observe(
        "fakeCanvas",
        errorInfo(() =>
          callRaw(
            context,
            "createPattern",
            { getContext: () => null, width: 3, height: 5 },
            "repeat",
          ),
        ),
      );
      a.observe(
        "imageData",
        errorInfo(() =>
          callRaw(context, "createPattern", new ImageData(3, 5), "repeat"),
        ),
      );
      a.assert(true, "error identities recorded");
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
      // Native accepts canvas sources; the support matrix excludes them, so
      // the compat side must report unsupported-api instead.
      const result = outcome(() => {
        context.createPattern(source, "repeat");
      });
      const expected = isCompat(a) ? "unsupported-api" : "ok";
      a.assert(result === expected, "canvas source follows approved semantics");
      a.observe("canvas", result === expected ? "as-approved" : result);
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
    id: "paint.pattern.creation-transform-ignored",
    requirements: [
      "context.createPattern",
      "context.translate",
      "context.save",
      "context.restore",
    ],
    async run(a) {
      const context = asNative(a.context);
      context.save();
      context.translate(1, 0);
      const pattern = context.createPattern(await loadImage(STRIPES_3x5), "repeat");
      context.restore(); // draw-time space is identity again
      assignFill(context, pattern);
      context.fillRect(0, 0, 24, 24);
      // Native truth (issue #33): the creation-time transform does NOT bake
      // into the pattern; only the draw-time space sets the tile phase, so
      // this fill must match an untransformed one. Mirror of npot-phase.
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
  {
    ...renderBase,
    id: "paint.pattern.source-swap-after-create",
    requirements: ["context.createPattern", "context.fillRect"],
    async run(a) {
      const context = asNative(a.context);
      const image = await loadImage(STRIPES_3x5);
      const pattern = context.createPattern(image, "repeat");
      a.assert(pattern !== null, "repeat pattern created before the src swap");
      image.src = YELLOW_BLACK_3x5;
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
      assignFill(context, pattern);
      context.fillRect(0, 0, 24, 24);
      // Creation-time bitmap capture (HTML Standard; Chromium probe on issue
      // #36; implemented by issue #37): the pattern keeps the creation-time
      // bitmap, so the swapped-in yellow/black tile must NOT appear. The
      // native side asserts the painted pixels directly; the compat side has
      // no readback API, so its scene artifact diffed against this asserted
      // reference is its half of the assertion.
      if (!isCompat(a)) {
        const row = (context as Ctx).getImageData(0, 0, 3, 1).data;
        a.assert(
          row[0] === 255 && row[1] === 0 && row[2] === 0 && row[3] === 255,
          "first stripe is the creation-time red, not the swapped-in yellow",
        );
        a.assert(
          row[4] === 0 && row[5] === 255 && row[6] === 0 && row[7] === 255,
          "second stripe is the creation-time green, not the swapped-in black",
        );
        a.assert(
          row[8] === 0 && row[9] === 0 && row[10] === 255 && row[11] === 255,
          "third stripe is the creation-time blue",
        );
      }
    },
  },
];
