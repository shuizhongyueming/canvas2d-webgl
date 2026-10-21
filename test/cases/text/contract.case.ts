import type { CaseDefinition } from "../../types/testing.js";
import { isCompat } from "../shared.js";
import { callText, textMessage, textOutcome } from "./helpers.js";

const base = {
  kind: "semantic" as const,
  width: 16,
  height: 16,
  seed: 1,
  fonts: ["10px sans-serif"],
};

/**
 * Member contract and WebIDL argument semantics for the three text entries.
 * Observations compare native and compat verbatim, including error messages;
 * the unsupported maxWidth overload pins the approved per-side divergence.
 */
export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "context.fillText.contract",
    requirements: ["context.fillText"],
    run(a) {
      const context = a.context;
      a.assert(typeof context.fillText === "function", "fillText is installed");
      a.observe(
        "returnValue",
        context.fillText("contract", 1, 8) === undefined,
      );
      // A draw leaves the public state untouched.
      a.observe("fontKept", context.font);
      a.observe("alignKept", context.textAlign);
      a.observe("fillStyleKept", String(context.fillStyle));
      a.observe(
        "repeatCall",
        textOutcome(() => context.fillText("again", 2, 12)),
      );
    },
  },
  {
    ...base,
    id: "context.fillText.arity-3",
    requirements: ["context.fillText"],
    run(a) {
      const context = a.context;
      a.observe(
        "zero",
        textMessage(() => callText(context, "fillText")),
      );
      a.observe(
        "two",
        textMessage(() => callText(context, "fillText", "x", 1)),
      );
      a.observe(
        "three",
        textOutcome(() => callText(context, "fillText", "x", 1, 2)),
      );
      // The maxWidth overload is spec-legal but outside the support matrix.
      const maxWidth = textOutcome(() =>
        callText(context, "fillText", "x", 1, 2, 40),
      );
      const expected = isCompat(a) ? "unsupported-api" : "ok";
      a.assert(maxWidth === expected, "maxWidth follows approved semantics");
      a.observe("maxWidth", maxWidth === expected ? "as-approved" : maxWidth);
      // An explicit undefined is a missing optional argument, not maxWidth.
      a.observe(
        "undefinedMaxWidth",
        textOutcome(() => callText(context, "fillText", "x", 1, 2, undefined)),
      );
      // Non-finite coordinates are silently ignored; BigInt/Symbol are TypeErrors.
      a.observe(
        "nonFinite",
        [NaN, Infinity, -Infinity, undefined].map((value) =>
          textOutcome(() => callText(context, "fillText", "x", value, 2)),
        ),
      );
      a.observe(
        "bigint",
        textOutcome(() => callText(context, "fillText", "x", 1n, 2)),
      );
      a.observe(
        "symbolText",
        textOutcome(() => callText(context, "fillText", Symbol("s"), 1, 2)),
      );
      a.observe(
        "coercion",
        textOutcome(() => callText(context, "fillText", 42, "1", null)),
      );
    },
  },
  {
    ...base,
    id: "context.strokeText.contract",
    requirements: ["context.strokeText"],
    run(a) {
      const context = a.context;
      a.assert(
        typeof context.strokeText === "function",
        "strokeText is installed",
      );
      a.observe(
        "returnValue",
        context.strokeText("contract", 1, 8) === undefined,
      );
      context.strokeStyle = "#ff0000";
      context.lineWidth = 2;
      a.observe("strokeStyleKept", String(context.strokeStyle));
      a.observe("lineWidthKept", context.lineWidth);
      a.observe(
        "repeatCall",
        textOutcome(() => context.strokeText("again", 2, 12)),
      );
    },
  },
  {
    ...base,
    id: "context.strokeText.arity-3",
    requirements: ["context.strokeText"],
    run(a) {
      const context = a.context;
      a.observe(
        "zero",
        textMessage(() => callText(context, "strokeText")),
      );
      a.observe(
        "two",
        textMessage(() => callText(context, "strokeText", "x", 1)),
      );
      a.observe(
        "three",
        textOutcome(() => callText(context, "strokeText", "x", 1, 2)),
      );
      const maxWidth = textOutcome(() =>
        callText(context, "strokeText", "x", 1, 2, 40),
      );
      const expected = isCompat(a) ? "unsupported-api" : "ok";
      a.assert(maxWidth === expected, "maxWidth follows approved semantics");
      a.observe("maxWidth", maxWidth === expected ? "as-approved" : maxWidth);
      a.observe(
        "undefinedMaxWidth",
        textOutcome(() =>
          callText(context, "strokeText", "x", 1, 2, undefined),
        ),
      );
      a.observe(
        "nonFinite",
        [NaN, Infinity, -Infinity, undefined].map((value) =>
          textOutcome(() => callText(context, "strokeText", "x", 1, value)),
        ),
      );
      a.observe(
        "bigint",
        textOutcome(() => callText(context, "strokeText", "x", 1, 2n)),
      );
      a.observe(
        "symbolText",
        textOutcome(() => callText(context, "strokeText", Symbol("s"), 1, 2)),
      );
    },
  },
  {
    ...base,
    id: "context.measureText.contract",
    requirements: ["context.measureText", "metrics.width"],
    run(a) {
      const context = a.context;
      a.assert(
        typeof context.measureText === "function",
        "measureText is installed",
      );
      const metrics = context.measureText("contract");
      a.observe("returnType", typeof metrics);
      a.observe("widthType", typeof metrics.width);
      a.assert(
        typeof metrics.width === "number" && metrics.width > 0,
        "width is a positive number for a non-empty string",
      );
      // Measurement repeats deterministically and leaves the state untouched.
      a.observe("repeatWidth", context.measureText("contract").width);
      a.observe("fontKept", context.font);
    },
  },
  {
    ...base,
    id: "context.measureText.arity-1",
    requirements: ["context.measureText"],
    run(a) {
      const context = a.context;
      a.observe(
        "zero",
        textMessage(() => callText(context, "measureText")),
      );
      a.observe(
        "one",
        textOutcome(() => callText(context, "measureText", "x")),
      );
      a.observe(
        "extraIgnored",
        textOutcome(() => callText(context, "measureText", "x", 100, "junk")),
      );
      a.observe(
        "symbolText",
        textOutcome(() => callText(context, "measureText", Symbol("s"))),
      );
      a.observe(
        "coercion",
        textOutcome(() => callText(context, "measureText", null)),
      );
    },
  },
];
