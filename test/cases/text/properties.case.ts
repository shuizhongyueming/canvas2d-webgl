import type { CaseDefinition } from "../../types/testing.js";
import { isCompat } from "../shared.js";
import { textOutcome } from "./helpers.js";

const base = {
  kind: "semantic" as const,
  width: 16,
  height: 16,
  seed: 1,
  fonts: [] as string[],
};

/**
 * font/textAlign/textBaseline property semantics: native defaults, matrix
 * value domains, legal-but-unlisted values reported as unsupported-api, and
 * illegal assignments ignored exactly like native.
 */
export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "context.font.contract",
    requirements: ["context.font"],
    run(a) {
      const c = a.context;
      a.assert(c.font === "10px sans-serif", "default font is 10px sans-serif");
      c.font = "24px serif";
      a.assert(c.font === "24px serif", "font assignment round-trips");
      c.save();
      c.font = "12px monospace";
      c.restore();
      a.assert(c.font === "24px serif", "font participates in the state stack");
      a.observe("afterRestore", c.font);
    },
  },
  {
    ...base,
    id: "context.font.value-valid-font-string",
    requirements: ["context.font"],
    run(a) {
      const c = a.context;
      const seen: string[] = [];
      for (const value of [
        "24px serif",
        "italic bold 16px monospace",
        "normal 20px sans-serif",
        "12px serif",
      ]) {
        c.font = value;
        seen.push(c.font);
      }
      // Compat stores the native normalized serialization, so both sides
      // round-trip byte-identically, including dropped "normal" qualifiers.
      a.observe("accepted", seen);
      a.assert(
        seen.every((font) => font.length > 0),
        "valid fonts accepted",
      );
    },
  },
  {
    ...base,
    id: "text.font.invalid-ignored",
    requirements: ["context.font"],
    run(a) {
      const c = a.context;
      c.font = "24px serif";
      const held: string[] = [];
      for (const value of ["junk", "", "24px", "serif", "bold", "10 px serif"])
        c.font = value;
      held.push(c.font);
      const loose = c as unknown as { font: unknown };
      for (const value of [undefined, null, 42, {}, ["x"]]) loose.font = value;
      held.push(c.font);
      a.assert(
        held.every((font) => font === "24px serif"),
        "invalid font strings are ignored on both sides",
      );
      a.observe("held", held);
      a.observe(
        "symbol",
        textOutcome(() => {
          loose.font = Symbol("s");
        }),
      );
    },
  },
  {
    ...base,
    id: "context.textAlign.contract",
    requirements: ["context.textAlign"],
    run(a) {
      const c = a.context;
      a.assert(c.textAlign === "start", "default textAlign is start");
      c.textAlign = "center";
      a.assert(c.textAlign === "center", "textAlign assignment round-trips");
      c.save();
      c.textAlign = "right";
      c.restore();
      const restored: string = (() => c.textAlign)();
      a.assert(
        restored === "center",
        "textAlign participates in the state stack",
      );
      a.observe("afterRestore", restored);
    },
  },
  ...(["left", "center", "right"] as const).map(
    (value): CaseDefinition => ({
      ...base,
      id: `context.textAlign.value-${value}`,
      requirements: ["context.textAlign"],
      run(a) {
        const c = a.context;
        c.textAlign = value;
        a.assert(c.textAlign === value, `${value} is an accepted value`);
        a.observe("value", c.textAlign);
      },
    }),
  ),
  {
    ...base,
    id: "text.textAlign.unsupported-values",
    requirements: ["context.textAlign"],
    run(a) {
      const c = a.context;
      const loose = c as unknown as { textAlign: unknown };
      const results: string[] = [];
      for (const value of ["start", "end"]) {
        const result = textOutcome(() => {
          loose.textAlign = value;
        });
        const expected = isCompat(a) ? "unsupported-api" : "ok";
        a.assert(
          result === expected,
          `textAlign=${value} follows approved semantics`,
        );
        results.push(result === expected ? "as-approved" : result);
      }
      a.observe("codes", results);
      // start/end throw on compat without touching the state; illegal values
      // are silently ignored on both sides.
      c.textAlign = "right";
      const held: string[] = [];
      for (const junk of ["JUNK", 42, null, {}, ["x"]]) loose.textAlign = junk;
      held.push(c.textAlign);
      a.observe("held", held);
      a.observe(
        "symbol",
        textOutcome(() => {
          loose.textAlign = Symbol("x");
        }),
      );
    },
  },
  {
    ...base,
    id: "context.textBaseline.contract",
    requirements: ["context.textBaseline"],
    run(a) {
      const c = a.context;
      a.assert(
        c.textBaseline === "alphabetic",
        "default textBaseline is alphabetic",
      );
      c.textBaseline = "middle";
      a.assert(
        c.textBaseline === "middle",
        "textBaseline assignment round-trips",
      );
      c.save();
      c.textBaseline = "bottom";
      c.restore();
      const restored: string = (() => c.textBaseline)();
      a.assert(
        restored === "middle",
        "textBaseline participates in the state stack",
      );
      a.observe("afterRestore", restored);
    },
  },
  ...(["top", "middle", "bottom"] as const).map(
    (value): CaseDefinition => ({
      ...base,
      id: `context.textBaseline.value-${value}`,
      requirements: ["context.textBaseline"],
      run(a) {
        const c = a.context;
        c.textBaseline = value;
        a.assert(c.textBaseline === value, `${value} is an accepted value`);
        a.observe("value", c.textBaseline);
      },
    }),
  ),
  {
    ...base,
    id: "text.textBaseline.unsupported-values",
    requirements: ["context.textBaseline"],
    run(a) {
      const c = a.context;
      const loose = c as unknown as { textBaseline: unknown };
      const results: string[] = [];
      for (const value of ["alphabetic", "hanging", "ideographic"]) {
        const result = textOutcome(() => {
          loose.textBaseline = value;
        });
        const expected = isCompat(a) ? "unsupported-api" : "ok";
        a.assert(
          result === expected,
          `textBaseline=${value} follows approved semantics`,
        );
        results.push(result === expected ? "as-approved" : result);
      }
      a.observe("codes", results);
      c.textBaseline = "bottom";
      const held: string[] = [];
      for (const junk of ["JUNK", 42, null, {}, ["x"]])
        loose.textBaseline = junk;
      held.push(c.textBaseline);
      a.observe("held", held);
      a.observe(
        "symbol",
        textOutcome(() => {
          loose.textBaseline = Symbol("x");
        }),
      );
    },
  },
];
