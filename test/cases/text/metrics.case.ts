import type { CaseDefinition } from "../../types/testing.js";
import { isCompat, outcome } from "../shared.js";

const base = {
  kind: "semantic" as const,
  width: 16,
  height: 16,
  seed: 1,
  fonts: ["10px sans-serif"],
};

const UNSUPPORTED_METRICS = [
  "actualBoundingBoxLeft",
  "actualBoundingBoxRight",
  "actualBoundingBoxAscent",
  "actualBoundingBoxDescent",
  "fontBoundingBoxAscent",
  "fontBoundingBoxDescent",
  "emHeightAscent",
  "emHeightDescent",
  "hangingBaseline",
  "alphabeticBaseline",
  "ideographicBaseline",
] as const;

/**
 * The returned metrics object: only `width` is readable. Every other spec
 * TextMetrics member reports unsupported-api on access (support matrix owner:
 * text), while native returns numbers — the divergence is pinned per member
 * instead of hiding the members entirely.
 */
export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "metrics.width.contract",
    requirements: ["metrics.width", "context.measureText"],
    run(a) {
      const metrics = a.context.measureText("width");
      a.assert(typeof metrics.width === "number", "width is readable");
      a.assert(metrics.width >= 0, "width is non-negative");
      a.observe("width", metrics.width);
      a.observe("again", a.context.measureText("width").width);
      // Readonly on both sides: strict-mode assignment is a TypeError.
      const loose = metrics as unknown as Record<string, unknown>;
      a.observe(
        "readonlyAssignment",
        outcome(() => {
          loose.width = 1;
        }),
      );
      a.assert(metrics.width !== 1, "the assignment did not take");
    },
  },
  ...UNSUPPORTED_METRICS.map(
    (name): CaseDefinition => ({
      ...base,
      id: `metrics.${name}.contract`,
      requirements: [`metrics.${name}`],
      run(a) {
        const metrics = a.context.measureText("x") as unknown as Record<
          string,
          unknown
        >;
        a.assert(
          isCompat(a)
            ? name in metrics
            : metrics[name] === undefined || typeof metrics[name] === "number",
          `${name} follows the native capability or explicit exclusion contract`,
        );
        const result = outcome(() => metrics[name]);
        const expected = isCompat(a) ? "unsupported-api" : "ok";
        a.assert(result === expected, `${name} follows approved semantics`);
        a.observe("access", result === expected ? "as-approved" : result);
      },
    }),
  ),
  {
    ...base,
    id: "text.metrics.object-shape",
    requirements: ["context.measureText", "metrics.width"],
    run(a) {
      const metrics = a.context.measureText("shape") as unknown as Record<
        string,
        unknown
      >;
      a.observe("type", typeof metrics);
      a.observe("keys", Object.keys(metrics));
      a.observe("json", JSON.stringify(metrics));
      a.observe("hasWidth", "width" in metrics);
      // Each call returns a fresh object; identity cannot cross sides, so the
      // observation pins the width pair instead.
      const again = a.context.measureText("shape");
      a.assert(metrics !== (again as unknown), "fresh metrics object per call");
      a.observe("widths", [
        (metrics as { width: number }).width,
        again.width,
      ]);
    },
  },
  {
    ...base,
    id: "text.measureText.width-values",
    requirements: ["context.measureText", "metrics.width", "context.font"],
    fonts: ["12px monospace", "24px sans-serif"],
    run(a) {
      const c = a.context;
      const widths: Record<string, number> = {};
      c.font = "24px sans-serif";
      widths.latin = c.measureText("Canvas-2d").width;
      widths.cjk = c.measureText("画世界").width;
      widths.mixed = c.measureText("Ag_中文xy").width;
      widths.empty = c.measureText("").width;
      c.font = "12px monospace";
      widths.mono = c.measureText("iiiiWWWW").width;
      // Same browser, same loaded fonts: the measurements must be identical
      // on both sides, digit for digit.
      a.observe("widths", widths);
      a.assert(widths.empty === 0, "the empty string measures zero");
      a.assert(
        (widths.latin ?? 0) > 0 && (widths.cjk ?? 0) > 0,
        "non-empty strings measure positive widths",
      );
    },
  },
];
