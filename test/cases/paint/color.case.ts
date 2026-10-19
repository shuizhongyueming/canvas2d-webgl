import type { CompatGradient, CompatPattern } from "../../../src/api.js";
import type { CaseDefinition } from "../../types/testing.js";
import { errorInfo, loadImage, STRIPES_3x5 } from "./fixtures.js";
import { isCompat, outcome } from "./shared.js";

type Ctx = CanvasRenderingContext2D;
const asNative = (context: unknown): Ctx => context as Ctx;
const assignStyle = (
  context: Ctx,
  member: "fillStyle" | "strokeStyle",
  value: unknown,
): void => {
  (context as unknown as Record<string, unknown>)[member] = value;
};

const base = {
  kind: "semantic" as const,
  width: 16,
  height: 16,
  seed: 1,
  fonts: [],
};

function styleCases(member: "fillStyle" | "strokeStyle"): CaseDefinition[] {
  return [
    {
      ...base,
      id: `context.${member}.contract`,
      requirements: [`context.${member}`],
      run(a) {
        a.observe("default", asNative(a.context)[member]);
        assignStyle(asNative(a.context), member, "#123456");
        a.observe("assigned", asNative(a.context)[member]);
        a.assert(
          asNative(a.context)[member] === "#123456",
          "assignment sticks",
        );
      },
    },
    {
      ...base,
      id: `context.${member}.value-hex`,
      requirements: [`context.${member}`],
      run(a) {
        const context = asNative(a.context);
        assignStyle(context, member, "#1a2b3c");
        a.observe("hex6", context[member]);
        assignStyle(context, member, "#AbC");
        a.observe("hex3", context[member]);
        a.assert(context[member] === "#aabbcc", "canonical lowercase hex");
      },
    },
    {
      ...base,
      id: `context.${member}.value-rgba`,
      requirements: [`context.${member}`],
      run(a) {
        const context = asNative(a.context);
        assignStyle(context, member, "rgba(255,120,40,0.5)");
        a.observe("alpha", context[member]);
        assignStyle(context, member, "rgba(1,2,3,1)");
        a.observe("opaque", context[member]);
        a.assert(
          context[member] === "#010203",
          "alpha 1 canonicalizes to hex",
        );
      },
    },
    {
      ...base,
      id: `context.${member}.value-CompatGradient`,
      requirements: [`context.${member}`],
      run(a) {
        const context = asNative(a.context);
        const gradient = context.createLinearGradient(0, 0, 16, 16);
        gradient.addColorStop(0, "#ff0000");
        gradient.addColorStop(1, "#0000ff");
        assignStyle(context, member, gradient as unknown as CompatGradient);
        a.observe("identity", context[member] === gradient);
        a.assert(context[member] === gradient, "getter returns the object");
      },
    },
    {
      ...base,
      id: `context.${member}.value-CompatPattern`,
      requirements: [`context.${member}`],
      async run(a) {
        const context = asNative(a.context);
        const image = await loadImage(STRIPES_3x5);
        const pattern = context.createPattern(image, "repeat");
        a.assert(pattern !== null, "pattern created");
        assignStyle(context, member, pattern as unknown as CompatPattern);
        a.observe("identity", context[member] === pattern);
        a.assert(context[member] === pattern, "getter returns the object");
      },
    },
  ];
}

export const cases: CaseDefinition[] = [
  ...styleCases("fillStyle"),
  ...styleCases("strokeStyle"),
  {
    ...base,
    id: "paint.color.invalid-ignored",
    requirements: ["context.fillStyle", "context.strokeStyle"],
    run(a) {
      const context = asNative(a.context);
      assignStyle(context, "fillStyle", "#010203");
      for (const junk of ["not-a-color", "", "rgb(1,2)", "#abcde", null, 5]) {
        assignStyle(context, "fillStyle", junk);
      }
      a.observe("kept", context.fillStyle);
      a.assert(context.fillStyle === "#010203", "invalid values are ignored");
      assignStyle(context, "strokeStyle", "rgba(9,8,7,0.5)");
      assignStyle(context, "strokeStyle", "junk");
      a.observe("strokeKept", context.strokeStyle);
    },
  },
  {
    ...base,
    id: "paint.color.alpha-roundtrip",
    requirements: ["context.fillStyle"],
    run(a) {
      const context = asNative(a.context);
      const inputs = [
        "rgba(0,0,0,0.1)",
        "rgba(0,0,0,0.333)",
        "rgba(0,0,0,0.867)",
        "rgba(0,0,0,0.004)",
        "rgba(0,0,0,50%)",
        "rgba(0,0,0,2)",
        "rgba(0,0,0,0.999)",
        "#aabbccdd",
      ];
      for (const input of inputs) {
        assignStyle(context, "fillStyle", input);
        a.observe(input, context.fillStyle);
      }
    },
  },
  {
    ...base,
    id: "paint.color.alpha-byte-table",
    requirements: ["context.fillStyle"],
    run(a) {
      const context = asNative(a.context);
      const table: string[] = [];
      for (let byte = 0; byte < 256; byte += 1) {
        assignStyle(context, "fillStyle", `#000000${byte.toString(16).padStart(2, "0")}`);
        const serialized = context.fillStyle as string;
        table.push(serialized);
        // Re-assigning the serialization must be idempotent.
        assignStyle(context, "fillStyle", serialized);
        if (context.fillStyle !== serialized) table.push(`UNSTABLE:${byte}`);
      }
      a.assert(
        table.length === 256 && !table.some((v) => v.startsWith("UNSTABLE")),
        "all 256 alpha bytes serialize to a stable value",
      );
      a.observe("table", table);
    },
  },
  {
    ...base,
    id: "paint.color.unsupported-values",
    requirements: ["context.fillStyle"],
    run(a) {
      const context = asNative(a.context);
      for (const value of [
        "red",
        "transparent",
        "hsl(120,50%,50%)",
        "rgb(1 2 3 / 0.5)",
        "color(display-p3 1 0 0)",
      ]) {
        assignStyle(context, "fillStyle", "#010203");
        const result = outcome(() => {
          assignStyle(context, "fillStyle", value);
        });
        // Native parses and applies the legal value; compat rejects it with
        // unsupported-api and keeps the previous style.
        const expected = isCompat(a) ? "unsupported-api" : "ok";
        const sanctionedState =
          result === "ok"
            ? context.fillStyle !== "#010203"
            : context.fillStyle === "#010203";
        a.assert(result === expected, `${value} follows approved semantics`);
        a.assert(sanctionedState, `${value} leaves the sanctioned state`);
        a.observe(value, result === expected ? "as-approved" : result);
      }
    },
  },
];
