import type { CaseDefinition } from "../../types/testing.js";
import { loadFactory, makeTarget, outcome } from "../shared.js";
import {
  displayPixel,
  hooksFor,
  makeCompat,
  pixelAt,
  pixelsEqual,
  present,
  settle,
} from "./helpers.js";

const base = {
  kind: "semantic" as const,
  width: 8,
  height: 6,
  seed: 1,
  fonts: [] as string[],
};

export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "lifecycle.resize.same-size-pixels",
    requirements: ["CAN-04", "ACC-05"],
    async run(a) {
      const handle = await makeCompat(8, 6);
      const { context, canvas, hooks } = handle;
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 4, 4);
      await present(hooks);
      const before = hooks.readScene();
      a.assert(
        pixelsEqual(pixelAt(before, 0, 0), [255, 0, 0, 255]),
        "the pre-resize frame is visible in the scene",
      );

      context.globalAlpha = 0.5;
      context.translate(2, 2);
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(4, 4);
      canvas.width = 8; // same size

      const after = hooks.readScene();
      a.assert(after.generation > before.generation, "generation advanced");
      a.assert(
        after.width === 8 && after.height === 6,
        "same-size assignment keeps the size",
      );
      a.assert(
        after.pixels.every((byte) => byte === 0),
        "same-size assignment creates a transparent scene",
      );
      a.assert(context.globalAlpha === 1, "state reset");
      a.observe("generationBefore", before.generation);
      a.observe("generationAfter", after.generation);
      a.observe(
        "sceneCleared",
        after.pixels.every((byte) => byte === 0),
      );
      // The new empty scene is on display after the scheduled present.
      await present(hooks);
      const display = displayPixel(handle.gl, after.width, after.height, 0, 0);
      a.assert(display[3] === 0, "the display shows the cleared scene");
      a.observe("displayCleared", display);
      a.observe("contextStable", canvas.getContext("2d") === context);
      canvas.dispose();
    },
  },
  {
    ...base,
    id: "lifecycle.resize.zero-and-oversize",
    requirements: ["CAN-04"],
    async run(a) {
      const handle = await makeCompat(8, 6);
      const { context, canvas, hooks } = handle;
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 3, 3);
      context.globalAlpha = 0.75;
      await present(hooks);

      const zero = outcome(() => {
        canvas.width = 0;
      });
      a.assert(
        zero === "size-unsupported",
        "zero width reports the size limit",
      );
      a.assert(canvas.width === 8, "rejected width leaves the compat size");
      a.assert(context.globalAlpha === 0.75, "rejected width leaves state");
      const afterZero = hooks.readScene();
      a.assert(
        pixelsEqual(pixelAt(afterZero, 0, 0), [255, 0, 0, 255]),
        "rejected width leaves pixels untouched",
      );

      const oversize = outcome(() => {
        canvas.height = 1_000_000_000;
      });
      a.assert(
        oversize === "resource-limit",
        "a size beyond MAX_TEXTURE_SIZE reports resource-limit",
      );
      a.assert(canvas.height === 6, "rejected height leaves the compat size");
      const afterOversize = hooks.readScene();
      a.assert(
        pixelsEqual(pixelAt(afterOversize, 0, 0), [255, 0, 0, 255]),
        "rejected oversize leaves pixels untouched",
      );

      canvas.width = 10;
      a.assert(
        canvas.width === 10 && canvas.height === 6,
        "a legal resize applies",
      );
      a.assert(context.globalAlpha === 1, "a legal resize resets state");
      const resized = hooks.readScene();
      a.assert(
        resized.width === 10 && resized.height === 6,
        "the scene follows the accepted size",
      );
      a.assert(
        resized.pixels.every((byte) => byte === 0),
        "the accepted resize clears pixels",
      );
      a.observe("zero", zero);
      a.observe("oversize", oversize);
      a.observe("finalSize", [canvas.width, canvas.height]);
      a.observe(
        "finalCleared",
        resized.pixels.every((byte) => byte === 0),
      );
      canvas.dispose();
    },
  },
  {
    ...base,
    id: "lifecycle.resize.refused-target",
    requirements: ["CAN-04"],
    async run(a) {
      const { createCompatCanvas } = await loadFactory();
      const real = makeTarget(8, 6);
      // A platform target that claims success but never changes its bitmap
      // size: the compat object must report a capability limit, not a number
      // that only exists in the wrapper.
      const target = new Proxy(real, {
        set(object, property, value) {
          if (property === "width" || property === "height") return true;
          return Reflect.set(object, property, value);
        },
        get(object, property) {
          const value = Reflect.get(object, property, object);
          return typeof value === "function"
            ? Function.prototype.bind.call(value, object)
            : value;
        },
      }) as HTMLCanvasElement;
      const canvas = createCompatCanvas(target);
      const context = canvas.getContext("2d");
      const hooks = await hooksFor(canvas);
      const gl = real.getContext("webgl") as WebGLRenderingContext;
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 2, 2);
      context.globalAlpha = 0.5;
      await present(hooks);
      const before = hooks.readScene();

      const refused = outcome(() => {
        canvas.width = 10;
      });
      a.assert(
        refused === "size-unsupported",
        "refusal reports size-unsupported",
      );
      a.assert(
        canvas.width === 8,
        "the compat width stays at the accepted size",
      );
      a.assert(real.width === 8, "the target was never silently resized");
      a.assert(context.globalAlpha === 0.5, "refused resize leaves state");
      const after = hooks.readScene();
      a.assert(
        pixelsEqual(pixelAt(after, 0, 0), [255, 0, 0, 255]),
        "refused resize leaves the scene pixels untouched",
      );
      a.observe("code", refused);
      a.observe("width", canvas.width);
      a.observe("targetWidth", real.width);
      a.observe("alpha", context.globalAlpha);
      a.observe("scene", pixelAt(after, 0, 0));
      a.observe("sceneBefore", pixelAt(before, 0, 0));
      a.assert(!gl.isContextLost(), "resize never loses the target context");
      canvas.dispose();
    },
  },
  {
    ...base,
    id: "lifecycle.resize.queued-present",
    requirements: ["CAN-04", "CAN-05", "LIFE-02"],
    async run(a) {
      const handle = await makeCompat(8, 6);
      const { context, canvas, hooks, gl } = handle;
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 8, 6);
      const generation = hooks.readScene().generation;
      const waiting = settle(hooks.whenPresented(generation));
      // Resize in the same task, before the microtask checkpoint presents.
      canvas.width = 4;
      const outcomeOfWaiter = (await waiting).outcome;
      a.assert(
        outcomeOfWaiter === "present-invalidated",
        "the queued present is cancelled by resize",
      );
      await present(hooks);
      const scene = hooks.readScene();
      a.assert(
        scene.width === 4 && scene.height === 6,
        "the new scene has the new size",
      );
      a.assert(
        scene.pixels.every((byte) => byte === 0),
        "nothing from the stale generation reached the new scene",
      );
      // The display belongs to the new generation and shows the empty scene.
      a.assert(
        displayPixel(gl, scene.width, scene.height, 0, 0)[3] === 0,
        "the stale red frame was not presented over the cleared display",
      );
      a.observe("waiter", outcomeOfWaiter);
      a.observe(
        "sceneCleared",
        scene.pixels.every((byte) => byte === 0),
      );
      a.observe(
        "displayAlpha",
        displayPixel(gl, scene.width, scene.height, 0, 0)[3],
      );
      canvas.dispose();
    },
  },
  {
    ...base,
    id: "lifecycle.resize.reports-drawable-extent",
    requirements: ["CAN-04"],
    async run(a) {
      const handle = await makeCompat(8, 6);
      const { context, canvas, hooks } = handle;
      canvas.width = 3;
      canvas.height = 2;
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 3, 2);
      await present(hooks);
      const scene = hooks.readScene();
      a.assert(
        scene.width === 3 && scene.height === 2,
        "scene extent follows the resized canvas",
      );
      a.assert(
        pixelsEqual(pixelAt(scene, 2, 1), [255, 0, 0, 255]),
        "drawing covers the new extent",
      );
      a.observe("size", [scene.width, scene.height]);
      a.observe("corner", pixelAt(scene, 2, 1));
      canvas.dispose();
    },
  },
];
