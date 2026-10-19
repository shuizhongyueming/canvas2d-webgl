import type { CaseDefinition } from "../../types/testing.js";
import { callRect, rectMessage, rectOutcome } from "./helpers.js";

const base = {
  kind: "semantic" as const,
  width: 16,
  height: 16,
  seed: 1,
  fonts: [] as string[],
};

/**
 * Member contract and WebIDL argument semantics for the three rect entries.
 * Observations compare native and compat verbatim, including error messages.
 */
export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "context.fillRect.contract",
    requirements: ["context.fillRect"],
    run(a) {
      const context = a.context;
      a.assert(typeof context.fillRect === "function", "fillRect is installed");
      a.observe(
        "returnValue",
        context.fillRect(1, 1, 4, 4) === undefined,
      );
      // A draw leaves the public state untouched.
      a.observe("fillStyleKept", String(context.fillStyle));
      a.observe("alphaKept", context.globalAlpha);
      a.observe("repeatCall", rectOutcome(() => context.fillRect(2, 2, 4, 4)));
    },
  },
  {
    ...base,
    id: "context.fillRect.arity-4",
    requirements: ["context.fillRect"],
    run(a) {
      const context = a.context;
      a.observe("zero", rectMessage(() => callRect(context, "fillRect")));
      a.observe(
        "three",
        rectMessage(() => callRect(context, "fillRect", 1, 2, 3)),
      );
      a.observe(
        "four",
        rectOutcome(() => callRect(context, "fillRect", 1, 2, 3, 4)),
      );
      a.observe(
        "extraIgnored",
        rectOutcome(() => callRect(context, "fillRect", 1, 2, 3, 4, "extra")),
      );
      // Non-finite geometry is silently ignored; BigInt/Symbol are TypeErrors.
      a.observe(
        "nonFinite",
        ["nan", "infinity", "undefined"].map((kind) =>
          rectOutcome(() =>
            callRect(
              context,
              "fillRect",
              kind === "nan" ? NaN : kind === "infinity" ? Infinity : undefined,
              0,
              4,
              4,
            ),
          ),
        ),
      );
      a.observe(
        "bigint",
        rectOutcome(() => callRect(context, "fillRect", 1n, 0, 4, 4)),
      );
      a.observe(
        "coercion",
        rectOutcome(() => callRect(context, "fillRect", "1", null, 4, 4)),
      );
    },
  },
  {
    ...base,
    id: "context.clearRect.contract",
    requirements: ["context.clearRect"],
    run(a) {
      const context = a.context;
      a.assert(typeof context.clearRect === "function", "clearRect is installed");
      a.observe("returnValue", context.clearRect(1, 1, 4, 4) === undefined);
      // clearRect is paint-independent: the current styles stay put.
      context.fillStyle = "#ff0000";
      a.observe("fillStyleKept", String(context.fillStyle));
      a.observe("repeatCall", rectOutcome(() => context.clearRect(0, 0, 2, 2)));
    },
  },
  {
    ...base,
    id: "context.clearRect.arity-4",
    requirements: ["context.clearRect"],
    run(a) {
      const context = a.context;
      a.observe("zero", rectMessage(() => callRect(context, "clearRect")));
      a.observe(
        "three",
        rectMessage(() => callRect(context, "clearRect", 1, 2, 3)),
      );
      a.observe(
        "four",
        rectOutcome(() => callRect(context, "clearRect", 1, 2, 3, 4)),
      );
      a.observe(
        "extraIgnored",
        rectOutcome(() => callRect(context, "clearRect", 1, 2, 3, 4, "extra")),
      );
      a.observe(
        "nonFinite",
        [NaN, Infinity, -Infinity].map(
          (value) => rectOutcome(() => callRect(context, "clearRect", 0, 0, value, 4)),
        ),
      );
      a.observe(
        "bigint",
        rectOutcome(() => callRect(context, "clearRect", 0, 1n, 4, 4)),
      );
    },
  },
  {
    ...base,
    id: "context.strokeRect.contract",
    requirements: ["context.strokeRect"],
    run(a) {
      const context = a.context;
      a.assert(
        typeof context.strokeRect === "function",
        "strokeRect is installed",
      );
      a.observe("returnValue", context.strokeRect(1, 1, 4, 4) === undefined);
      context.strokeStyle = "#ff0000";
      context.lineWidth = 2;
      a.observe("strokeStyleKept", String(context.strokeStyle));
      a.observe("lineWidthKept", context.lineWidth);
      a.observe("repeatCall", rectOutcome(() => context.strokeRect(2, 2, 4, 4)));
    },
  },
  {
    ...base,
    id: "context.strokeRect.arity-4",
    requirements: ["context.strokeRect"],
    run(a) {
      const context = a.context;
      a.observe("zero", rectMessage(() => callRect(context, "strokeRect")));
      a.observe(
        "three",
        rectMessage(() => callRect(context, "strokeRect", 1, 2, 3)),
      );
      a.observe(
        "four",
        rectOutcome(() => callRect(context, "strokeRect", 1, 2, 3, 4)),
      );
      a.observe(
        "extraIgnored",
        rectOutcome(() => callRect(context, "strokeRect", 1, 2, 3, 4, "extra")),
      );
      a.observe(
        "nonFinite",
        [NaN, Infinity, -Infinity].map(
          (value) => rectOutcome(() => callRect(context, "strokeRect", 0, value, 4, 4)),
        ),
      );
      a.observe(
        "symbol",
        rectOutcome(() => callRect(context, "strokeRect", Symbol("s"), 0, 4, 4)),
      );
    },
  },
];