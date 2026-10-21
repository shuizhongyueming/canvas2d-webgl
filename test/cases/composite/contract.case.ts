import type { CaseDefinition } from "../../types/testing.js";
import { isCompat, outcome } from "../shared.js";

const base = {
  kind: "semantic" as const,
  width: 16,
  height: 16,
  seed: 1,
  fonts: [] as string[],
};
const modes = ["source-over", "source-atop", "source-in", "lighter"] as const;
const filters = ["brightness(120%)", "none"] as const;

export const cases: CaseDefinition[] = [
  ...modes.map(
    (mode): CaseDefinition => ({
      ...base,
      id: `context.globalCompositeOperation.value-${mode}`,
      requirements: ["context.globalCompositeOperation"],
      run(a) {
        a.context.globalCompositeOperation = mode;
        a.assert(
          a.context.globalCompositeOperation === mode,
          "supported composite round trips",
        );
      },
    }),
  ),
  ...filters.map(
    (filter): CaseDefinition => ({
      ...base,
      id: `context.filter.value-${encodeURIComponent(filter)}`,
      requirements: ["context.filter"],
      run(a) {
        a.context.filter = filter;
        a.assert(a.context.filter === filter, "supported filter round trips");
      },
    }),
  ),
  {
    ...base,
    id: "context.globalCompositeOperation.contract",
    requirements: ["context.globalCompositeOperation"],
    run(a) {
      const context = a.context;
      a.assert(
        context.globalCompositeOperation === "source-over",
        "native initial mode",
      );
      // Chromium 156 reads "normal" back as source-over (acceptance alias),
      // while case/whitespace variants and unknown tokens leave the mode.
      context.globalCompositeOperation = "lighter";
      Reflect.set(context, "globalCompositeOperation", "normal");
      a.assert(
        String(context.globalCompositeOperation) === "source-over",
        "normal aliases source-over",
      );
      for (const value of [
        "garbage",
        "Normal",
        "NORMAL",
        " normal ",
        "plus-lighter",
        "plus-darker",
        "destination",
        "SOURCE-OVER",
        " source-in ",
        null,
        undefined,
      ]) {
        context.globalCompositeOperation = "lighter";
        Reflect.set(context, "globalCompositeOperation", value);
        a.assert(
          context.globalCompositeOperation === "lighter",
          `invalid mode ignored: ${value}`,
        );
      }
      for (const value of [
        "copy",
        "clear",
        "destination-in",
        "xor",
        "multiply",
        "hue",
      ]) {
        const result = outcome(() => {
          Reflect.set(context, "globalCompositeOperation", value);
        });
        a.assert(
          result === (isCompat(a) ? "unsupported-api" : "ok"),
          `legal mode classified: ${value}`,
        );
      }
      a.assert(
        outcome(() => {
          Reflect.set(context, "globalCompositeOperation", Symbol());
        }) === "TypeError",
        "Symbol conversion rejects",
      );
    },
  },
  {
    ...base,
    id: "context.filter.contract",
    requirements: ["context.filter", "context.save", "context.restore"],
    run(a) {
      const context = a.context;
      a.assert(context.filter === "none", "native initial filter");
      for (const value of [
        "",
        " ",
        "asdf",
        "brightness(-1)",
        "blur(-1px)",
        "blur(abc)",
        "drop-shadow()",
        "drop-shadow(abc)",
        "hue-rotate(90)",
        "brightness(120%)junk",
        null,
        undefined,
      ]) {
        context.filter = "brightness(120%)";
        Reflect.set(context, "filter", value);
        a.assert(
          context.filter === "brightness(120%)",
          `invalid filter ignored: ${value}`,
        );
      }
      for (const value of [
        "blur()",
        "brightness()",
        "hue-rotate()",
        "url()",
        "brightness(50%)",
        "brightness(1.2)",
        "Brightness(120%)",
        "brightness( 120% )",
        " none ",
        "blur(5px)",
        "drop-shadow(1px 2px rgba(0,0,0,0.5))",
        "brightness(120%) blur(5px)",
      ]) {
        const result = outcome(() => {
          Reflect.set(context, "filter", value);
        });
        a.assert(
          result === (isCompat(a) ? "unsupported-api" : "ok"),
          `legal filter classified: ${value}`,
        );
      }
      context.globalCompositeOperation = "source-atop";
      context.filter = "brightness(120%)";
      context.save();
      context.globalCompositeOperation = "lighter";
      context.filter = "none";
      context.restore();
      a.assert(
        String(context.globalCompositeOperation) === "source-atop" &&
          String(context.filter) === "brightness(120%)",
        "save/restore preserves composite and filter",
      );
      a.assert(
        outcome(() => {
          Reflect.set(context, "filter", Symbol());
        }) === "TypeError",
        "Symbol conversion rejects",
      );
    },
  },
];
