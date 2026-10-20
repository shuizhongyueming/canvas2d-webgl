import type { CaseDefinition } from "../../types/testing.js";
import { isCompat } from "../shared.js";
import { callPath, pathMessage, pathOutcome } from "./helpers.js";

const base = {
  kind: "semantic" as const,
  width: 16,
  height: 16,
  seed: 1,
  fonts: [] as string[],
};

/**
 * Member contract and WebIDL argument semantics for the approved path entries.
 * Observations compare native and compat verbatim, including error messages.
 * Overloads outside the approved zero-argument fill/stroke are spec-legal on
 * native and must report unsupported-api on compat, never silently pass.
 */
export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "context.beginPath.contract",
    requirements: ["context.beginPath"],
    run(a) {
      const context = a.context;
      a.assert(typeof context.beginPath === "function", "beginPath is installed");
      a.observe("returnValue", context.beginPath() === undefined);
      a.observe("repeatCall", pathOutcome(() => context.beginPath()));
      // beginPath only resets the current path; styles stay put.
      context.fillStyle = "#ff0000";
      context.beginPath();
      a.observe("fillStyleKept", String(context.fillStyle));
    },
  },
  {
    ...base,
    id: "context.beginPath.arity-0",
    requirements: ["context.beginPath"],
    run(a) {
      const context = a.context;
      a.observe("zero", pathOutcome(() => callPath(context, "beginPath")));
      // Native ignores extra arguments; compat follows.
      a.observe("extra", pathOutcome(() => callPath(context, "beginPath", 1, "x")));
    },
  },
  {
    ...base,
    id: "context.closePath.contract",
    requirements: ["context.closePath"],
    run(a) {
      const context = a.context;
      a.assert(typeof context.closePath === "function", "closePath is installed");
      context.moveTo(1, 1);
      context.lineTo(4, 1);
      a.observe("returnValue", context.closePath() === undefined);
      // closePath on an empty current path is a native no-op.
      context.beginPath();
      a.observe("empty", pathOutcome(() => context.closePath()));
      a.observe("repeatCall", pathOutcome(() => context.closePath()));
    },
  },
  {
    ...base,
    id: "context.closePath.arity-0",
    requirements: ["context.closePath"],
    run(a) {
      const context = a.context;
      a.observe("zero", pathOutcome(() => callPath(context, "closePath")));
      a.observe("extra", pathOutcome(() => callPath(context, "closePath", 1, 2)));
    },
  },
  {
    ...base,
    id: "context.moveTo.contract",
    requirements: ["context.moveTo"],
    run(a) {
      const context = a.context;
      a.assert(typeof context.moveTo === "function", "moveTo is installed");
      a.observe("returnValue", context.moveTo(1, 2) === undefined);
      a.observe("repeatCall", pathOutcome(() => context.moveTo(3, 4)));
      a.observe("transformKept", pathOutcome(() => {
        context.moveTo(0, 0);
        context.translate(1, 1);
        context.moveTo(1, 1);
      }));
    },
  },
  {
    ...base,
    id: "context.moveTo.arity-2",
    requirements: ["context.moveTo"],
    run(a) {
      const context = a.context;
      a.observe("zero", pathMessage(() => callPath(context, "moveTo")));
      a.observe("one", pathMessage(() => callPath(context, "moveTo", 1)));
      a.observe("two", pathOutcome(() => callPath(context, "moveTo", 1, 2)));
      a.observe("extraIgnored", pathOutcome(() => callPath(context, "moveTo", 1, 2, "extra")));
      // Non-finite geometry is silently ignored; BigInt/Symbol are TypeErrors.
      a.observe(
        "nonFinite",
        [NaN, Infinity, undefined].map((value) =>
          pathOutcome(() => callPath(context, "moveTo", value, 0)),
        ),
      );
      a.observe("bigint", pathOutcome(() => callPath(context, "moveTo", 1n, 0)));
      a.observe("symbol", pathOutcome(() => callPath(context, "moveTo", 0, Symbol("s"))));
      a.observe("coercion", pathOutcome(() => callPath(context, "moveTo", "1", null)));
    },
  },
  {
    ...base,
    id: "context.lineTo.contract",
    requirements: ["context.lineTo"],
    run(a) {
      const context = a.context;
      a.assert(typeof context.lineTo === "function", "lineTo is installed");
      a.observe("returnValue", context.lineTo(4, 4) === undefined);
      // lineTo with no preceding subpath records like moveTo (native no-op geometry).
      a.observe("repeatCall", pathOutcome(() => context.lineTo(8, 8)));
    },
  },
  {
    ...base,
    id: "context.lineTo.arity-2",
    requirements: ["context.lineTo"],
    run(a) {
      const context = a.context;
      a.observe("zero", pathMessage(() => callPath(context, "lineTo")));
      a.observe("one", pathMessage(() => callPath(context, "lineTo", 1)));
      a.observe("two", pathOutcome(() => callPath(context, "lineTo", 1, 2)));
      a.observe("extraIgnored", pathOutcome(() => callPath(context, "lineTo", 1, 2, 3)));
      a.observe(
        "nonFinite",
        [NaN, -Infinity, undefined].map((value) =>
          pathOutcome(() => callPath(context, "lineTo", 0, value)),
        ),
      );
      a.observe("bigint", pathOutcome(() => callPath(context, "lineTo", 1n, 2n)));
      a.observe("coercion", pathOutcome(() => callPath(context, "lineTo", "2", true)));
    },
  },
  {
    ...base,
    id: "context.rect.contract",
    requirements: ["context.rect"],
    run(a) {
      const context = a.context;
      a.assert(typeof context.rect === "function", "rect is installed");
      a.observe("returnValue", context.rect(1, 1, 4, 4) === undefined);
      a.observe("repeatCall", pathOutcome(() => context.rect(2, 2, 4, 4)));
      // Negative extents are legal geometry, exactly like fillRect.
      a.observe("negative", pathOutcome(() => context.rect(8, 8, -4, -4)));
    },
  },
  {
    ...base,
    id: "context.rect.arity-4",
    requirements: ["context.rect"],
    run(a) {
      const context = a.context;
      a.observe("zero", pathMessage(() => callPath(context, "rect")));
      a.observe("three", pathMessage(() => callPath(context, "rect", 1, 2, 3)));
      a.observe("four", pathOutcome(() => callPath(context, "rect", 1, 2, 3, 4)));
      a.observe("extraIgnored", pathOutcome(() => callPath(context, "rect", 1, 2, 3, 4, 5)));
      a.observe(
        "nonFinite",
        [NaN, Infinity, -Infinity].map((value) =>
          pathOutcome(() => callPath(context, "rect", 0, 0, value, 4)),
        ),
      );
      a.observe("symbol", pathOutcome(() => callPath(context, "rect", 0, Symbol("s"), 4, 4)));
    },
  },
  {
    ...base,
    id: "context.quadraticCurveTo.contract",
    requirements: ["context.quadraticCurveTo"],
    run(a) {
      const context = a.context;
      a.assert(
        typeof context.quadraticCurveTo === "function",
        "quadraticCurveTo is installed",
      );
      a.observe(
        "returnValue",
        context.quadraticCurveTo(2, 0, 4, 4) === undefined,
      );
      a.observe("repeatCall", pathOutcome(() => context.quadraticCurveTo(6, 8, 8, 4)));
    },
  },
  {
    ...base,
    id: "context.quadraticCurveTo.arity-4",
    requirements: ["context.quadraticCurveTo"],
    run(a) {
      const context = a.context;
      a.observe("zero", pathMessage(() => callPath(context, "quadraticCurveTo")));
      a.observe("three", pathMessage(() => callPath(context, "quadraticCurveTo", 1, 2, 3)));
      a.observe("four", pathOutcome(() => callPath(context, "quadraticCurveTo", 1, 2, 3, 4)));
      a.observe(
        "extraIgnored",
        pathOutcome(() => callPath(context, "quadraticCurveTo", 1, 2, 3, 4, 5)),
      );
      a.observe(
        "nonFinite",
        [NaN, Infinity].map((value) =>
          pathOutcome(() => callPath(context, "quadraticCurveTo", 1, value, 3, 4)),
        ),
      );
      a.observe(
        "bigint",
        pathOutcome(() => callPath(context, "quadraticCurveTo", 1n, 2, 3, 4)),
      );
    },
  },
  {
    ...base,
    id: "context.arcTo.contract",
    requirements: ["context.arcTo"],
    run(a) {
      const context = a.context;
      a.assert(typeof context.arcTo === "function", "arcTo is installed");
      context.moveTo(1, 1);
      a.observe("returnValue", context.arcTo(4, 1, 4, 4, 2) === undefined);
      a.observe("repeatCall", pathOutcome(() => context.arcTo(8, 4, 8, 8, 2)));
      a.observe(
        "negativeRadius",
        pathMessage(() => callPath(context, "arcTo", 4, 1, 4, 4, -2)),
      );
    },
  },
  {
    ...base,
    id: "context.arcTo.arity-5",
    requirements: ["context.arcTo"],
    run(a) {
      const context = a.context;
      a.observe("zero", pathMessage(() => callPath(context, "arcTo")));
      a.observe("four", pathMessage(() => callPath(context, "arcTo", 1, 2, 3, 4)));
      a.observe("five", pathOutcome(() => callPath(context, "arcTo", 1, 2, 3, 4, 5)));
      a.observe(
        "extraIgnored",
        pathOutcome(() => callPath(context, "arcTo", 1, 2, 3, 4, 5, 6)),
      );
      // The radius check fires before the non-finite skip only when every
      // argument is finite, matching native ordering.
      a.observe(
        "negativeRadius",
        pathOutcome(() => callPath(context, "arcTo", 1, 2, 3, 4, -5)),
      );
      a.observe(
        "nonFinite",
        pathOutcome(() => callPath(context, "arcTo", 1, Infinity, 3, 4, -5)),
      );
      a.observe("zero-radius", pathOutcome(() => callPath(context, "arcTo", 1, 2, 3, 4, 0)));
    },
  },
  {
    ...base,
    id: "context.arc.contract",
    requirements: ["context.arc"],
    run(a) {
      const context = a.context;
      a.assert(typeof context.arc === "function", "arc is installed");
      a.observe("returnValue", context.arc(8, 8, 4, 0, Math.PI) === undefined);
      a.observe("anticlockwise", pathOutcome(() => context.arc(8, 8, 4, 0, Math.PI, true)));
      a.observe(
        "negativeRadius",
        pathMessage(() => callPath(context, "arc", 8, 8, -4, 0, Math.PI)),
      );
      a.observe("repeatCall", pathOutcome(() => context.arc(4, 4, 2, 0, Math.PI * 2)));
    },
  },
  {
    ...base,
    id: "context.arc.arity-5",
    requirements: ["context.arc"],
    run(a) {
      const context = a.context;
      a.observe("zero", pathMessage(() => callPath(context, "arc")));
      a.observe("four", pathMessage(() => callPath(context, "arc", 1, 2, 3, 4)));
      a.observe("five", pathOutcome(() => callPath(context, "arc", 8, 8, 3, 0, 1)));
      a.observe(
        "negativeRadius",
        pathOutcome(() => callPath(context, "arc", 8, 8, -3, 0, 1)),
      );
      a.observe(
        "nonFinite",
        [NaN, Infinity, undefined].map((value) =>
          pathOutcome(() => callPath(context, "arc", value, 8, 3, 0, 1)),
        ),
      );
      a.observe("nonFiniteRadius", pathOutcome(() => callPath(context, "arc", 8, 8, NaN, 0, 1)));
      a.observe("bigint", pathOutcome(() => callPath(context, "arc", 1n, 8, 3, 0, 1)));
    },
  },
  {
    ...base,
    id: "context.arc.arity-6",
    requirements: ["context.arc"],
    run(a) {
      const context = a.context;
      a.observe("clockwise", pathOutcome(() => callPath(context, "arc", 8, 8, 3, 0, 1, false)));
      a.observe("anticlockwise", pathOutcome(() => callPath(context, "arc", 8, 8, 3, 0, 1, true)));
      // WebIDL boolean coercion: any truthy/falsy value converts, never throws.
      a.observe(
        "coercion",
        ["yes", "", 1, 0, null, undefined].map((value) =>
          pathOutcome(() => callPath(context, "arc", 8, 8, 3, 0, 1, value)),
        ),
      );
      a.observe(
        "extraIgnored",
        pathOutcome(() => callPath(context, "arc", 8, 8, 3, 0, 1, true, "extra")),
      );
    },
  },
  {
    ...base,
    id: "context.ellipse.contract",
    requirements: ["context.ellipse"],
    run(a) {
      const context = a.context;
      a.assert(typeof context.ellipse === "function", "ellipse is installed");
      a.observe(
        "returnValue",
        context.ellipse(8, 8, 4, 2, 0, 0, Math.PI * 2) === undefined,
      );
      a.observe(
        "negativeMajor",
        pathMessage(() => callPath(context, "ellipse", 8, 8, -4, 2, 0, 0, 1)),
      );
      a.observe(
        "negativeMinor",
        pathMessage(() => callPath(context, "ellipse", 8, 8, 4, -2, 0, 0, 1)),
      );
      a.observe("repeatCall", pathOutcome(() => context.ellipse(4, 4, 2, 1, 0.5, 0, 1)));
    },
  },
  {
    ...base,
    id: "context.ellipse.arity-7",
    requirements: ["context.ellipse"],
    run(a) {
      const context = a.context;
      a.observe("zero", pathMessage(() => callPath(context, "ellipse")));
      a.observe("six", pathMessage(() => callPath(context, "ellipse", 1, 2, 3, 4, 5, 6)));
      a.observe("seven", pathOutcome(() => callPath(context, "ellipse", 8, 8, 4, 2, 0, 0, 1)));
      a.observe(
        "negativeRadius",
        pathOutcome(() => callPath(context, "ellipse", 8, 8, -4, 2, 0, 0, 1)),
      );
      a.observe(
        "nonFinite",
        [NaN, Infinity].map((value) =>
          pathOutcome(() => callPath(context, "ellipse", 8, 8, value, 2, 0, 0, 1)),
        ),
      );
      a.observe(
        "nonFiniteRotation",
        pathOutcome(() => callPath(context, "ellipse", 8, 8, 4, 2, NaN, 0, 1)),
      );
    },
  },
  {
    ...base,
    id: "context.ellipse.arity-8",
    requirements: ["context.ellipse"],
    run(a) {
      const context = a.context;
      a.observe(
        "clockwise",
        pathOutcome(() => callPath(context, "ellipse", 8, 8, 4, 2, 0, 0, 1, false)),
      );
      a.observe(
        "anticlockwise",
        pathOutcome(() => callPath(context, "ellipse", 8, 8, 4, 2, 0, 0, 1, true)),
      );
      a.observe(
        "coercion",
        ["x", 0].map((value) =>
          pathOutcome(() => callPath(context, "ellipse", 8, 8, 4, 2, 0, 0, 1, value)),
        ),
      );
      a.observe(
        "extraIgnored",
        pathOutcome(() => callPath(context, "ellipse", 8, 8, 4, 2, 0, 0, 1, true, 9)),
      );
    },
  },
  {
    ...base,
    id: "context.fill.contract",
    requirements: ["context.fill"],
    run(a) {
      const context = a.context;
      a.assert(typeof context.fill === "function", "fill is installed");
      context.beginPath();
      context.rect(1, 1, 4, 4);
      a.observe("returnValue", context.fill() === undefined);
      // fill does not consume the current path: a repeat fills the same area.
      a.observe("repeatCall", pathOutcome(() => context.fill()));
      a.observe("fillStyleKept", String(context.fillStyle));
    },
  },
  {
    ...base,
    id: "context.fill.arity-0",
    requirements: ["context.fill"],
    run(a) {
      const context = a.context;
      a.observe("zero", pathOutcome(() => callPath(context, "fill")));
      const overloads: ReadonlyArray<readonly [string, readonly unknown[]]> = [
        ["rule-evenodd", ["evenodd"]],
        ["rule-bogus", ["bogus"]],
        ["path2d", [new Path2D()]],
        ["path2d-and-rule", [new Path2D(), "evenodd"]],
      ];
      for (const [label, args] of overloads) {
        const result = pathOutcome(() => callPath(context, "fill", ...args));
        // Native runs the spec-legal overloads (a bogus rule is a TypeError);
        // compat reports every non-zero-argument form as unsupported-api.
        const expected = isCompat(a)
          ? "unsupported-api"
          : label === "rule-bogus"
            ? "TypeError"
            : "ok";
        a.assert(result === expected, `${label} follows approved semantics`);
        a.observe(label, result === expected ? "as-approved" : result);
      }
    },
  },
  {
    ...base,
    id: "context.stroke.contract",
    requirements: ["context.stroke"],
    run(a) {
      const context = a.context;
      a.assert(typeof context.stroke === "function", "stroke is installed");
      context.beginPath();
      context.rect(1, 1, 6, 6);
      a.observe("returnValue", context.stroke() === undefined);
      a.observe("repeatCall", pathOutcome(() => context.stroke()));
      context.strokeStyle = "#ff0000";
      context.lineWidth = 2;
      a.observe("strokeStyleKept", String(context.strokeStyle));
      a.observe("lineWidthKept", context.lineWidth);
    },
  },
  {
    ...base,
    id: "context.stroke.arity-0",
    requirements: ["context.stroke"],
    run(a) {
      const context = a.context;
      a.observe("zero", pathOutcome(() => callPath(context, "stroke")));
      const overloads: ReadonlyArray<readonly [string, readonly unknown[]]> = [
        ["path2d", [new Path2D()]],
        ["rule-string", ["evenodd"]],
      ];
      for (const [label, args] of overloads) {
        const result = pathOutcome(() => callPath(context, "stroke", ...args));
        // Native accepts a Path2D (a string is a TypeError); compat reports
        // every non-zero-argument form as unsupported-api.
        const expected = isCompat(a)
          ? "unsupported-api"
          : label === "rule-string"
            ? "TypeError"
            : "ok";
        a.assert(result === expected, `${label} follows approved semantics`);
        a.observe(label, result === expected ? "as-approved" : result);
      }
    },
  },
];
