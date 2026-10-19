import type { CaseDefinition } from "../../types/testing.js";
import { isCompat, outcome } from "../shared.js";

const base = {
  kind: "semantic" as const,
  width: 8,
  height: 8,
  seed: 1,
  fonts: [] as string[],
};

export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "context.translate.contract",
    requirements: ["context.translate"],
    run(a) {
      const c = a.context;
      a.assert(typeof c.translate === "function", "translate is a function");
      a.observe("finite", outcome(() => c.translate(10, 20)));
      a.observe("nan", outcome(() => c.translate(NaN, 0)));
      a.observe("infinity", outcome(() => c.translate(Infinity, 1)));
      const translate = c.translate as (x: unknown, y: unknown) => void;
      a.observe("coerced", outcome(() => translate.call(c, "3", "4")));
    },
  },
  {
    ...base,
    id: "context.translate.arity-2",
    requirements: ["context.translate"],
    run(a) {
      const c = a.context;
      a.observe("twoArgs", outcome(() => c.translate(5, 6)));
      const translate = c.translate as (...args: unknown[]) => void;
      a.assert(
        outcome(() => translate.call(c, 7)) === "TypeError",
        "one argument throws TypeError",
      );
      a.assert(
        outcome(() => translate.call(c)) === "TypeError",
        "zero arguments throw TypeError",
      );
    },
  },
  {
    ...base,
    id: "context.rotate.contract",
    requirements: ["context.rotate"],
    run(a) {
      const c = a.context;
      a.assert(typeof c.rotate === "function", "rotate is a function");
      a.observe("finite", outcome(() => c.rotate(Math.PI / 4)));
      a.observe("nan", outcome(() => c.rotate(NaN)));
      a.observe("infinity", outcome(() => c.rotate(Infinity)));
    },
  },
  {
    ...base,
    id: "context.rotate.arity-1",
    requirements: ["context.rotate"],
    run(a) {
      const c = a.context;
      a.observe("oneArg", outcome(() => c.rotate(0.25)));
      const rotate = c.rotate as (...args: unknown[]) => void;
      a.assert(
        outcome(() => rotate.call(c)) === "TypeError",
        "zero arguments throw TypeError",
      );
    },
  },
  {
    ...base,
    id: "context.scale.contract",
    requirements: ["context.scale"],
    run(a) {
      const c = a.context;
      a.assert(typeof c.scale === "function", "scale is a function");
      a.observe("finite", outcome(() => c.scale(2, 0.5)));
      a.observe("zero", outcome(() => c.scale(0, 0)));
      a.observe("nan", outcome(() => c.scale(NaN, 1)));
    },
  },
  {
    ...base,
    id: "context.scale.arity-2",
    requirements: ["context.scale"],
    run(a) {
      const c = a.context;
      a.observe("twoArgs", outcome(() => c.scale(2, 3)));
      const scale = c.scale as (...args: unknown[]) => void;
      a.assert(
        outcome(() => scale.call(c, 2)) === "TypeError",
        "one argument throws TypeError",
      );
    },
  },
  {
    ...base,
    id: "context.setTransform.contract",
    requirements: ["context.setTransform"],
    run(a) {
      const c = a.context;
      a.assert(typeof c.setTransform === "function", "setTransform is a function");
      a.observe("finite", outcome(() => c.setTransform(2, 0, 0, 2, 5, 5)));
      a.observe("negative", outcome(() => c.setTransform(-1, 0, 0, -1, 0, 0)));
      a.observe("nan", outcome(() => c.setTransform(1, 0, 0, NaN, 0, 0)));
    },
  },
  {
    ...base,
    id: "context.setTransform.arity-6",
    requirements: ["context.setTransform"],
    run(a) {
      const c = a.context;
      a.observe("six", outcome(() => c.setTransform(1, 0, 0, 1, 2, 3)));
      const setTransform = c.setTransform as (...args: unknown[]) => void;
      a.observe("extra", outcome(() => setTransform.call(c, 3, 0, 0, 3, 1, 1, 99)));
      a.assert(
        outcome(() => setTransform.call(c, 1, 2, 3, 4, 5)) === "TypeError",
        "five arguments throw TypeError",
      );
    },
  },
  {
    ...base,
    id: "state.scale.negative",
    requirements: ["context.scale"],
    run(a) {
      const c = a.context;
      a.observe("mirrorBoth", outcome(() => c.scale(-2, -1)));
      c.save();
      a.observe("mirrorX", outcome(() => c.scale(-3, 2)));
      c.restore();
      a.observe("nested", outcome(() => c.scale(-1, -4)));
    },
  },
  {
    ...base,
    id: "state.setTransform.overload-unsupported",
    requirements: ["context.setTransform"],
    run(a) {
      const setTransform = a.context.setTransform as (...args: unknown[]) => void;
      const context = a.context;
      const zero = outcome(() => setTransform.call(context));
      const objectForm = outcome(() =>
        setTransform.call(context, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
      );
      const primitive = outcome(() => setTransform.call(context, 5));
      const expected = isCompat(a)
        ? { zero: "unsupported-api", objectForm: "unsupported-api" }
        : { zero: "ok", objectForm: "ok" };
      a.assert(zero === expected.zero, "zero-argument form follows approved semantics");
      a.assert(objectForm === expected.objectForm, "matrix-object form follows approved semantics");
      a.assert(primitive === "TypeError", "primitive single argument throws TypeError");
      a.observe("zero", zero === expected.zero ? "as-approved" : zero);
      a.observe("objectForm", objectForm === expected.objectForm ? "as-approved" : objectForm);
      a.observe("primitive", primitive === "TypeError" ? "as-approved" : primitive);
    },
  },
  {
    ...base,
    id: "state.transform.singular-ctm",
    requirements: ["context.translate", "context.scale", "context.setTransform"],
    run(a) {
      const c = a.context;
      c.setTransform(1, 0, 0, 0, 0, 0);
      a.observe("translateOnSingular", outcome(() => c.translate(5, 5)));
      a.observe("scaleOnSingular", outcome(() => c.scale(2, 2)));
      a.observe("rotateOnSingular", outcome(() => c.rotate(1)));
      a.observe("rescue", outcome(() => c.setTransform(1, 0, 0, 1, 0, 0)));
      c.scale(0, 0);
      a.observe("translateAfterZeroScale", outcome(() => c.translate(5, 5)));
    },
  },
  {
    ...base,
    id: "state.transform.bigint-typeerror",
    requirements: [
      "context.translate",
      "context.rotate",
      "context.scale",
      "context.setTransform",
      "context.globalAlpha",
      "context.lineWidth",
    ],
    run(a) {
      const c = a.context;
      const translate = c.translate as (...args: unknown[]) => void;
      const rotate = c.rotate as (...args: unknown[]) => void;
      const scale = c.scale as (...args: unknown[]) => void;
      const setTransform = c.setTransform as (...args: unknown[]) => void;
      const loose = c as unknown as { globalAlpha: unknown; lineWidth: unknown };
      a.observe("translate", outcome(() => translate.call(c, 1n, 0)));
      a.observe("rotate", outcome(() => rotate.call(c, 1n)));
      a.observe("scale", outcome(() => scale.call(c, 1n, 1)));
      a.observe("setTransform", outcome(() => setTransform.call(c, 1n, 0, 0, 1, 0, 0)));
      a.observe("globalAlpha", outcome(() => { loose.globalAlpha = 1n; }));
      a.observe("lineWidth", outcome(() => { loose.lineWidth = 1n; }));
      a.assert(c.globalAlpha === 1 && c.lineWidth === 1, "BigInt assignments change nothing");
    },
  },
];
