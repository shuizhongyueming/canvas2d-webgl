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
    id: "canvas.toDataURL.contract",
    requirements: ["canvas.toDataURL"],
    run(a) {
      const canvas = a.canvas as unknown as { toDataURL(): unknown };
      a.assert(typeof canvas.toDataURL === "function", "member is present");
      const result = outcome(() => canvas.toDataURL());
      const expected = isCompat(a) ? "unsupported-api" : "ok";
      a.assert(result === expected, "toDataURL follows approved exclusion semantics");
      a.observe("call", result === expected ? "as-approved" : result);
    },
  },
  {
    ...base,
    id: "canvas.toBlob.contract",
    requirements: ["canvas.toBlob"],
    run(a) {
      const canvas = a.canvas as unknown as {
        toBlob(callback: () => void): unknown;
      };
      a.assert(typeof canvas.toBlob === "function", "member is present");
      const result = outcome(() => canvas.toBlob(() => undefined));
      const expected = isCompat(a) ? "unsupported-api" : "ok";
      a.assert(result === expected, "toBlob follows approved exclusion semantics");
      a.observe("call", result === expected ? "as-approved" : result);
    },
  },
  {
    ...base,
    id: "canvas.captureStream.contract",
    requirements: ["canvas.captureStream"],
    run(a) {
      const canvas = a.canvas as unknown as { captureStream(): unknown };
      a.assert(typeof canvas.captureStream === "function", "member is present");
      const result = outcome(() => canvas.captureStream());
      const expected = isCompat(a) ? "unsupported-api" : "ok";
      a.assert(
        result === expected,
        "captureStream follows approved exclusion semantics",
      );
      a.observe("call", result === expected ? "as-approved" : result);
    },
  },
  {
    ...base,
    id: "canvas.transferControlToOffscreen.contract",
    requirements: ["canvas.transferControlToOffscreen"],
    run(a) {
      const canvas = a.canvas as unknown as {
        transferControlToOffscreen(): unknown;
      };
      a.assert(
        typeof canvas.transferControlToOffscreen === "function",
        "member is present",
      );
      const result = outcome(() => canvas.transferControlToOffscreen());
      // The native reference canvas is already bound to a 2D context by the
      // harness, so the platform reports InvalidStateError; the compat canvas
      // reports the approved exclusion.
      const expected = isCompat(a) ? "unsupported-api" : "InvalidStateError";
      a.assert(
        result === expected,
        "transferControlToOffscreen follows approved exclusion semantics",
      );
      a.observe("call", result === expected ? "as-approved" : result);
    },
  },
  {
    ...base,
    id: "canvas.context-readback.excluded",
    requirements: [
      "context.getImageData",
      "context.putImageData",
      "context.createImageData",
    ],
    run(a) {
      const context = a.context as unknown as Record<
        string,
        (...args: unknown[]) => unknown
      >;
      const calls: Array<[string, () => unknown]> = [
        ["getImageData", () => context.getImageData!(0, 0, 1, 1)],
        [
          "putImageData",
          () => context.putImageData!(new ImageData(1, 1), 0, 0),
        ],
        ["createImageData", () => context.createImageData!(1, 1)],
      ];
      const expected = isCompat(a) ? "unsupported-api" : "ok";
      const results = calls.map(
        ([name, invoke]) => [name, outcome(invoke)] as const,
      );
      a.assert(
        results.every(([, result]) => result === expected),
        "context readback entries follow approved exclusion semantics",
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
