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
    id: "canvas.context-stubs.unsupported",
    requirements: ["context.bezierCurveTo", "context.setLineDash"],
    run(a) {
      const context = a.context as unknown as Record<
        string,
        (...args: unknown[]) => unknown
      >;
      const calls: Array<[string, () => unknown]> = [
        ["bezierCurveTo", () => context.bezierCurveTo!(0, 0, 1, 1, 2, 2)],
        ["setLineDash", () => context.setLineDash!([1, 2])],
        [
          "createRadialGradient",
          () => context.createRadialGradient!(0, 0, 1, 0, 0, 2),
        ],
      ];
      const expected = isCompat(a) ? "unsupported-api" : "ok";
      const results = calls.map(
        ([name, invoke]) => [name, outcome(invoke)] as const,
      );
      a.assert(
        results.every(([, result]) => result === expected),
        "excluded context entries report unsupported-api on compat",
      );
      a.observe(
        "codes",
        results.every(([, result]) => result === expected)
          ? "as-approved"
          : Object.fromEntries(results),
      );
    },
  },
];
