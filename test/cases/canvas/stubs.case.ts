import type { CaseDefinition } from "../../types/testing.js";
import { isCompat, makeTarget, outcome } from "./shared.js";

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
    id: "canvas.context-stubs.not-implemented",
    requirements: [
      "context.fillRect",
      "context.clearRect",
      "context.strokeRect",
      "context.drawImage",
      "context.beginPath",
      "context.fill",
      "context.stroke",
      "context.clip",
      "context.fillText",
      "context.strokeText",
      "context.measureText",
    ],
    run(a) {
      const context = a.context as unknown as Record<
        string,
        (...args: unknown[]) => unknown
      >;
      const source = makeTarget(1, 1);
      const calls: Array<[string, () => unknown]> = [
        ["fillRect", () => context.fillRect!(0, 0, 1, 1)],
        ["clearRect", () => context.clearRect!(0, 0, 1, 1)],
        ["strokeRect", () => context.strokeRect!(0, 0, 1, 1)],
        ["drawImage", () => context.drawImage!(source, 0, 0)],
        ["beginPath", () => context.beginPath!()],
        ["fill", () => context.fill!()],
        ["stroke", () => context.stroke!()],
        ["clip", () => context.clip!()],
        ["fillText", () => context.fillText!("x", 0, 0)],
        ["strokeText", () => context.strokeText!("x", 0, 0)],
        ["measureText", () => context.measureText!("x")],
      ];
      // Approved drawing entries that no feature owns yet must report
      // not-implemented; silently succeeding would be a contract violation.
      const expected = isCompat(a) ? "not-implemented" : "ok";
      const results = calls.map(
        ([name, invoke]) => [name, outcome(invoke)] as const,
      );
      for (const [name, result] of results)
        a.assert(
          typeof context[name] === "function",
          `${name} is present as a stub`,
        );
      a.assert(
        results.every(([, result]) => result === expected),
        "unimplemented drawing entries report not-implemented on compat",
      );
      a.observe(
        "codes",
        results.every(([, result]) => result === expected)
          ? "as-approved"
          : Object.fromEntries(results),
      );
    },
  },
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
        ["createRadialGradient", () => context.createRadialGradient!(0, 0, 1, 0, 0, 2)],
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
