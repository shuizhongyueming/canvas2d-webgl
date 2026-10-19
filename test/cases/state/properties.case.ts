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
    id: "state.defaults",
    requirements: [
      "context.globalAlpha",
      "context.lineWidth",
      "context.lineCap",
      "context.lineJoin",
      "ACC-01",
    ],
    run(a) {
      const c = a.context;
      a.assert(
        c.globalAlpha === 1 &&
          c.lineWidth === 1 &&
          c.lineCap === "butt" &&
          c.lineJoin === "miter",
        "native initial drawing state",
      );
      a.observe("defaults", {
        globalAlpha: c.globalAlpha,
        lineWidth: c.lineWidth,
        lineCap: c.lineCap,
        lineJoin: c.lineJoin,
      });
    },
  },
  {
    ...base,
    id: "context.globalAlpha.contract",
    requirements: ["context.globalAlpha"],
    run(a) {
      const c = a.context;
      a.assert(c.globalAlpha === 1, "default globalAlpha is 1");
      c.globalAlpha = 0.5;
      a.assert(c.globalAlpha === 0.5, "globalAlpha assignment round-trips");
      c.save();
      c.globalAlpha = 0.1;
      c.restore();
      a.assert(c.globalAlpha === 0.5, "globalAlpha participates in the state stack");
      a.observe("afterRestore", c.globalAlpha);
    },
  },
  {
    ...base,
    id: "context.globalAlpha.value-finite-number-%5B0%2C1%5D",
    requirements: ["context.globalAlpha"],
    run(a) {
      const c = a.context;
      const seen: number[] = [];
      for (const value of [0, 0.25, 0.5, 0.75, 1]) {
        c.globalAlpha = value;
        seen.push(c.globalAlpha);
      }
      a.assert(seen.join() === "0,0.25,0.5,0.75,1", "in-range finite numbers are accepted");
      a.observe("accepted", seen);
    },
  },
  {
    ...base,
    id: "state.globalAlpha.invalid-ignored",
    requirements: ["context.globalAlpha"],
    run(a) {
      const c = a.context;
      const loose = c as unknown as { globalAlpha: unknown };
      c.globalAlpha = 0.5;
      const held: number[] = [];
      for (const value of [-0.1, 1.1, NaN, Infinity, -Infinity, "abc", undefined, {}, true]) {
        loose.globalAlpha = value;
        held.push(c.globalAlpha);
      }
      loose.globalAlpha = "0.25";
      const coerced = c.globalAlpha;
      loose.globalAlpha = null;
      const afterNull = c.globalAlpha;
      a.assert(
        held.every((v, i) => (i === 8 ? v === 1 : v === 0.5)),
        "out-of-range, non-finite and non-numeric values are ignored; true coerces to 1",
      );
      a.observe("held", held);
      a.observe("coerced", coerced);
      a.observe("nullCoercedToZero", afterNull);
    },
  },
  {
    ...base,
    id: "context.lineWidth.contract",
    requirements: ["context.lineWidth"],
    run(a) {
      const c = a.context;
      a.assert(c.lineWidth === 1, "default lineWidth is 1");
      c.lineWidth = 5;
      a.assert(c.lineWidth === 5, "lineWidth assignment round-trips");
      c.save();
      c.lineWidth = 9;
      c.restore();
      a.assert(c.lineWidth === 5, "lineWidth participates in the state stack");
      a.observe("afterRestore", c.lineWidth);
    },
  },
  {
    ...base,
    id: "context.lineWidth.value-positive-finite-number",
    requirements: ["context.lineWidth"],
    run(a) {
      const c = a.context;
      const seen: number[] = [];
      for (const value of [0.5, 2, 100, Number.EPSILON]) {
        c.lineWidth = value;
        seen.push(c.lineWidth);
      }
      a.assert(seen.every((v, i) => v === [0.5, 2, 100, Number.EPSILON][i]), "positive finite numbers are accepted");
      a.observe("accepted", seen);
    },
  },
  {
    ...base,
    id: "state.lineWidth.invalid-ignored",
    requirements: ["context.lineWidth"],
    run(a) {
      const c = a.context;
      const loose = c as unknown as { lineWidth: unknown };
      c.lineWidth = 3;
      const held: number[] = [];
      for (const value of [0, -2, NaN, Infinity, -Infinity, "abc", undefined, {}, null]) {
        loose.lineWidth = value;
        held.push(c.lineWidth);
      }
      loose.lineWidth = "2";
      const coerced = c.lineWidth;
      a.assert(held.every((v) => v === 3), "non-positive, non-finite and non-numeric values are ignored");
      a.observe("held", held);
      a.observe("coerced", coerced);
    },
  },
  {
    ...base,
    id: "context.lineCap.contract",
    requirements: ["context.lineCap"],
    run(a) {
      const c = a.context;
      a.assert(c.lineCap === "butt", "default lineCap is butt");
      c.lineCap = "round";
      a.assert(c.lineCap === "round", "lineCap assignment round-trips");
      c.save();
      c.lineCap = "butt";
      c.restore();
      const restored: string = (() => c.lineCap)();
      a.assert(restored === "round", "lineCap participates in the state stack");
      a.observe("afterRestore", restored);
    },
  },
  {
    ...base,
    id: "context.lineCap.value-butt",
    requirements: ["context.lineCap"],
    run(a) {
      const c = a.context;
      c.lineCap = "round";
      c.lineCap = "butt";
      a.assert(c.lineCap === "butt", "butt is an accepted value");
      a.observe("value", c.lineCap);
    },
  },
  {
    ...base,
    id: "context.lineCap.value-round",
    requirements: ["context.lineCap"],
    run(a) {
      const c = a.context;
      c.lineCap = "round";
      a.assert(c.lineCap === "round", "round is an accepted value");
      a.observe("value", c.lineCap);
    },
  },
  {
    ...base,
    id: "context.lineJoin.contract",
    requirements: ["context.lineJoin"],
    run(a) {
      const c = a.context;
      a.assert(c.lineJoin === "miter", "default lineJoin is miter");
      c.lineJoin = "round";
      a.assert(c.lineJoin === "round", "lineJoin assignment round-trips");
      c.save();
      c.restore();
      a.assert(c.lineJoin === "round", "lineJoin participates in the state stack");
      a.observe("afterRestore", c.lineJoin);
    },
  },
  {
    ...base,
    id: "context.lineJoin.value-round",
    requirements: ["context.lineJoin"],
    run(a) {
      const c = a.context;
      c.lineJoin = "round";
      a.assert(c.lineJoin === "round", "round is an accepted value");
      a.observe("value", c.lineJoin);
    },
  },
  {
    ...base,
    id: "state.lineCap.square-unsupported",
    requirements: ["context.lineCap"],
    run(a) {
      const loose = a.context as unknown as { lineCap: unknown };
      const result = outcome(() => {
        loose.lineCap = "square";
      });
      const read = result === "ok" ? a.context.lineCap : result;
      const expected = isCompat(a) ? "unsupported-api" : "square";
      a.assert(read === expected, "lineCap=square follows approved semantics");
      a.observe("square", read === expected ? "as-approved" : read);
    },
  },
  {
    ...base,
    id: "state.lineJoin.unsupported-values",
    requirements: ["context.lineJoin"],
    run(a) {
      const loose = a.context as unknown as { lineJoin: unknown };
      const miter = outcome(() => {
        loose.lineJoin = "miter";
      });
      const bevel = outcome(() => {
        loose.lineJoin = "bevel";
      });
      const expected = isCompat(a) ? "unsupported-api" : "ok";
      const expectedApplied = isCompat(a) ? "miter" : "bevel";
      a.assert(miter === expected, "lineJoin=miter follows approved semantics");
      a.assert(bevel === expected, "lineJoin=bevel follows approved semantics");
      a.assert(a.context.lineJoin === expectedApplied, "final lineJoin matches approved semantics");
      a.observe("miter", miter === expected ? "as-approved" : miter);
      a.observe("bevel", bevel === expected ? "as-approved" : bevel);
      a.observe("applied", a.context.lineJoin === expectedApplied ? "as-approved" : a.context.lineJoin);
    },
  },
  {
    ...base,
    id: "state.line-cap-join.invalid-ignored",
    requirements: ["context.lineCap", "context.lineJoin"],
    run(a) {
      const c = a.context;
      const loose = c as unknown as { lineCap: unknown; lineJoin: unknown };
      c.lineCap = "round";
      c.lineJoin = "round";
      for (const junk of ["foo", 42, null, {}, ["x"]]) {
        loose.lineCap = junk;
        loose.lineJoin = junk;
      }
      a.assert(c.lineCap === "round" && c.lineJoin === "round", "illegal values are ignored");
      a.observe("afterJunk", [c.lineCap, c.lineJoin]);
      a.observe(
        "symbolCap",
        outcome(() => {
          loose.lineCap = Symbol("x");
        }),
      );
      a.observe(
        "symbolJoin",
        outcome(() => {
          loose.lineJoin = Symbol("x");
        }),
      );
    },
  },
];
