import type { CompatGradient } from "../../../src/api.js";
import type { CaseDefinition } from "../../types/testing.js";
import { errorInfo, callRaw } from "./fixtures.js";

type Ctx = CanvasRenderingContext2D;
const asNative = (context: unknown): Ctx => context as Ctx;

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
  height: 32,
  seed: 1,
  fonts: [],
};

function twoStopGradient(context: Ctx, x1 = 20): CanvasGradient {
  const gradient = context.createLinearGradient(0, 0, x1, 0);
  gradient.addColorStop(0, "#ff0000");
  gradient.addColorStop(1, "#0000ff");
  return gradient;
}

export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "context.createLinearGradient.contract",
    requirements: ["context.createLinearGradient"],
    run(a) {
      const gradient = asNative(a.context).createLinearGradient(0, 0, 16, 16);
      a.observe("type", typeof gradient);
      a.observe("addColorStop", typeof gradient.addColorStop);
      a.assert(typeof gradient.addColorStop === "function", "gradient live");
    },
  },
  {
    ...base,
    id: "context.createLinearGradient.arity-4",
    requirements: ["context.createLinearGradient"],
    run(a) {
      const context = asNative(a.context);
      a.observe("four", errorInfo(() => context.createLinearGradient(0, 0, 1, 1)));
      a.observe(
        "three",
        errorInfo(() => callRaw(context, "createLinearGradient", 0, 0, 1)),
      );
      a.observe(
        "none",
        errorInfo(() => callRaw(context, "createLinearGradient")),
      );
      a.observe("nan", errorInfo(() => context.createLinearGradient(NaN, 0, 1, 1)));
      a.observe(
        "infinity",
        errorInfo(() => context.createLinearGradient(0, 0, Infinity, 1)),
      );
    },
  },
  {
    ...base,
    id: "gradient.addColorStop.contract",
    requirements: ["gradient.addColorStop"],
    run(a) {
      const gradient = asNative(a.context).createLinearGradient(0, 0, 16, 0);
      a.observe("ok", errorInfo(() => gradient.addColorStop(0.5, "#ff0000")));
      a.observe("low", errorInfo(() => gradient.addColorStop(-0.1, "#fff")));
      a.observe("high", errorInfo(() => gradient.addColorStop(1.1, "#fff")));
      a.observe("nan", errorInfo(() => gradient.addColorStop(NaN, "#fff")));
      a.observe("badColor", errorInfo(() => gradient.addColorStop(0.5, "junk")));
      a.observe(
        "nullColor",
        errorInfo(() => callRaw(gradient, "addColorStop", 0.5, null)),
      );
      a.observe(
        "stringOffset",
        errorInfo(() => callRaw(gradient, "addColorStop", "0.5", "#fff")),
      );
      a.observe("edges", errorInfo(() => {
        gradient.addColorStop(0, "#000");
        gradient.addColorStop(1, "#fff");
      }));
    },
  },
  {
    ...base,
    id: "gradient.addColorStop.arity-2",
    requirements: ["gradient.addColorStop"],
    run(a) {
      const gradient = asNative(a.context).createLinearGradient(0, 0, 16, 0);
      a.observe("two", errorInfo(() => gradient.addColorStop(0.25, "#123456")));
      a.observe(
        "one",
        errorInfo(() => callRaw(gradient, "addColorStop", 0.25)),
      );
      a.observe("zero", errorInfo(() => callRaw(gradient, "addColorStop")));
      a.observe(
        "extra",
        errorInfo(() =>
          callRaw(gradient, "addColorStop", 0.75, "#654321", "ignored"),
        ),
      );
    },
  },
  {
    ...base,
    id: "paint.gradient.stop-color-unsupported",
    requirements: ["gradient.addColorStop"],
    run(a) {
      const gradient = asNative(a.context).createLinearGradient(0, 0, 16, 0);
      for (const color of ["red", "hsl(120,50%,50%)", "rgb(1 2 3 / 0.5)"]) {
        let reported: string | null = null;
        try {
          gradient.addColorStop(0.5, color);
        } catch (error) {
          reported = String((error as { code?: unknown })?.code);
        }
        if (reported === null) {
          a.assert(true, `native accepts ${color}`);
        } else {
          a.assert(
            reported === "unsupported-api",
            `${color} reports unsupported-api, got ${reported}`,
          );
        }
      }
    },
  },
  {
    ...renderBase,
    id: "paint.gradient.degenerate",
    requirements: ["context.createLinearGradient", "context.fillRect"],
    run(a) {
      const context = asNative(a.context);
      const degenerate = context.createLinearGradient(10, 10, 10, 10);
      degenerate.addColorStop(0, "#ff0000");
      degenerate.addColorStop(1, "#0000ff");
      context.fillStyle = "#00ff00";
      context.fillRect(0, 0, 32, 32);
      context.fillStyle = degenerate as unknown as CompatGradient;
      context.fillRect(0, 0, 64, 32); // zero-length line paints nothing
      const empty = context.createLinearGradient(0, 0, 64, 0);
      context.fillStyle = empty as unknown as CompatGradient;
      context.fillRect(32, 0, 32, 32); // no stops paint nothing either
    },
  },
  {
    ...renderBase,
    id: "paint.gradient.transform-after-create",
    requirements: ["context.createLinearGradient", "context.translate"],
    run(a) {
      const context = asNative(a.context);
      const gradient = twoStopGradient(context);
      context.translate(40, 0);
      context.fillStyle = gradient as unknown as CompatGradient;
      context.fillRect(0, 0, 20, 32);
      // Native truth (probe, issue #15): the gradient follows the draw-time
      // transform, so the ramp spans device x 40..60.
    },
  },
  {
    ...renderBase,
    id: "paint.gradient.transform-save-restore",
    requirements: [
      "context.createLinearGradient",
      "context.save",
      "context.restore",
    ],
    run(a) {
      const context = asNative(a.context);
      context.save();
      context.translate(40, 0);
      const gradient = twoStopGradient(context);
      context.restore();
      context.fillStyle = gradient as unknown as CompatGradient;
      context.fillRect(40, 0, 20, 32);
      // Native truth: creation-time transforms do NOT bake into gradients;
      // the fill uses the identity draw-time space and lands past the ramp.
    },
  },
  {
    ...renderBase,
    id: "paint.gradient.stops-duplicate-order",
    requirements: ["gradient.addColorStop", "context.fillRect"],
    run(a) {
      const context = asNative(a.context);
      const gradient = context.createLinearGradient(0, 0, 64, 0);
      gradient.addColorStop(1, "#ffffff");
      gradient.addColorStop(0.5, "#00ff00");
      gradient.addColorStop(0, "#ff0000");
      gradient.addColorStop(0.5, "#0000ff");
      context.fillStyle = gradient as unknown as CompatGradient;
      context.fillRect(0, 0, 64, 32);
    },
  },
  {
    ...renderBase,
    id: "paint.gradient.addColorStop-after-assign",
    requirements: ["gradient.addColorStop", "context.fillStyle"],
    run(a) {
      const context = asNative(a.context);
      const gradient = context.createLinearGradient(0, 0, 32, 0);
      gradient.addColorStop(0, "#ff0000");
      gradient.addColorStop(1, "#ff0000");
      context.fillStyle = gradient as unknown as CompatGradient;
      context.fillRect(0, 0, 32, 32);
      // The held gradient is mutated after assignment; the next fill sees it.
      gradient.addColorStop(1, "#0000ff");
      context.fillRect(32, 0, 32, 32);
    },
  },
];
