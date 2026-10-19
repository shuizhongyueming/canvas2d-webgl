import type { CaseDefinition } from "../../types/testing.js";
import { isCompat, outcome } from "./shared.js";

const base = {
  kind: "semantic" as const,
  width: 8,
  height: 8,
  seed: 1,
  fonts: [] as string[],
};

type ContextGetter = (type: string) => unknown;

function getContextOf(canvas: unknown): ContextGetter {
  const holder = canvas as { getContext(type: string): unknown };
  return (type) => holder.getContext(type);
}

export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "CAN-02.identity",
    requirements: ["CAN-02"],
    run(a) {
      const getContext = getContextOf(a.canvas);
      const first = getContext("2d");
      const second = getContext("2d");
      a.assert(!!first, "getContext('2d') returns a context");
      a.assert(first === second, "repeated getContext('2d') keeps identity");
      a.assert(first === a.context, "adapter context matches a fresh request");
      const canvasOf = (first as { canvas?: unknown }).canvas;
      a.assert(canvasOf === a.canvas, "context.canvas points back to the canvas");
      a.observe("stable", first === second && first === a.context);
      a.observe("canvasBackReference", canvasOf === a.canvas);
    },
  },
  {
    ...base,
    id: "context.canvas.contract",
    requirements: ["context.canvas"],
    run(a) {
      const context = a.context as unknown as { canvas: unknown };
      a.assert(context.canvas === a.canvas, "context.canvas is the canvas");
      a.observe("identity", context.canvas === a.canvas);
      const assigned = outcome(() => {
        context.canvas = null;
      });
      a.assert(assigned === "TypeError", "context.canvas is read-only");
      a.observe("readOnly", assigned);
      a.assert(context.canvas === a.canvas, "assignment never took effect");
    },
  },
  {
    ...base,
    id: "canvas.getContext.contract",
    requirements: ["canvas.getContext"],
    run(a) {
      const getContext = getContextOf(a.canvas);
      a.assert(typeof a.canvas.getContext === "function", "getContext is a function");
      const first = getContext("2d");
      a.assert(!!first && typeof first === "object", "2d returns the context object");
      a.assert(getContext("2d") === first, "identity is stable across calls");
      a.observe("identity", getContext("2d") === first);
      a.observe("returnsContext", !!first);
    },
  },
  {
    ...base,
    id: "canvas.getContext.arity-1",
    requirements: ["canvas.getContext"],
    run(a) {
      const getContext = getContextOf(a.canvas);
      const single = getContext("2d");
      a.assert(!!single, "exactly one argument returns the context");
      a.assert(single === a.context, "the single-argument form is the adapter context");
      a.observe("arity1", !!single);
    },
  },
  {
    ...base,
    id: "canvas.getContext.value-2d",
    requirements: ["canvas.getContext"],
    run(a) {
      const getContext = getContextOf(a.canvas);
      const context = getContext("2d");
      a.assert(!!context && context === a.context, "'2d' is the supported type");
      a.observe("value", "2d");
    },
  },
  {
    ...base,
    id: "canvas.getContext.non-2d",
    requirements: ["canvas.getContext"],
    run(a) {
      const getContext = getContextOf(a.canvas);
      const results = [
        getContext("webgl") === null,
        getContext("webgl2") === null,
        getContext("bitmaprenderer") === null,
        getContext("2D") === null,
        getContext("") === null,
      ];
      a.assert(
        results.every((result) => result),
        "non-'2d' context types return null",
      );
      a.observe("allNull", results);
    },
  },
  {
    ...base,
    id: "canvas.getContext.arguments",
    requirements: ["canvas.getContext"],
    run(a) {
      const canvas = a.canvas as unknown as {
        getContext(...args: unknown[]): unknown;
      };
      a.observe("zeroArguments", outcome(() => canvas.getContext()));
      const twoArguments = outcome(() => canvas.getContext("2d", {}));
      const expected = isCompat(a) ? "unsupported-api" : "ok";
      a.assert(
        twoArguments === expected,
        "the context-attributes argument follows approved semantics",
      );
      a.observe("twoArguments", twoArguments === expected ? "as-approved" : twoArguments);
    },
  },
];
