import type { CaseDefinition } from "../../types/testing.js";

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
    id: "context.save.contract",
    requirements: ["context.save"],
    run(a) {
      const c = a.context;
      a.assert(typeof c.save === "function", "save is a function");
      c.globalAlpha = 0.5;
      c.lineWidth = 3;
      c.lineCap = "round";
      c.lineJoin = "round";
      c.save();
      c.globalAlpha = 1;
      c.lineWidth = 9;
      c.lineCap = "butt";
      c.restore();
      const read = () =>
        [c.globalAlpha, c.lineWidth, c.lineCap, c.lineJoin] as const;
      const restored = read();
      a.assert(restored[0] === 0.5, "save captures globalAlpha");
      a.assert(restored[1] === 3, "save captures lineWidth");
      a.assert(restored[2] === "round", "save captures lineCap");
      a.assert(restored[3] === "round", "save captures lineJoin");
      a.observe("restored", [...restored]);
    },
  },
  {
    ...base,
    id: "context.save.arity-0",
    requirements: ["context.save"],
    run(a) {
      const save: (...args: unknown[]) => void = a.context.save.bind(a.context);
      a.assert(save(1, "extra") === undefined, "save tolerates extra arguments and returns undefined");
      a.observe("extraArgs", "tolerated");
    },
  },
  {
    ...base,
    id: "context.restore.contract",
    requirements: ["context.restore"],
    run(a) {
      const c = a.context;
      a.assert(typeof c.restore === "function", "restore is a function");
      c.globalAlpha = 0.1;
      c.save();
      c.globalAlpha = 0.2;
      c.save();
      c.globalAlpha = 0.3;
      c.restore();
      const afterFirst = c.globalAlpha;
      c.restore();
      const afterSecond = c.globalAlpha;
      a.assert(afterFirst === 0.2 && afterSecond === 0.1, "restore pops in LIFO order");
      a.observe("order", [afterFirst, afterSecond]);
    },
  },
  {
    ...base,
    id: "context.restore.arity-0",
    requirements: ["context.restore"],
    run(a) {
      const c = a.context;
      const restore: (...args: unknown[]) => void = c.restore.bind(c);
      a.assert(restore(9) === undefined, "restore tolerates extra arguments and returns undefined");
      restore();
      restore();
      a.assert(c.globalAlpha === 1, "restore on an empty stack is a no-op");
      a.observe("emptyStack", "no-op");
    },
  },
  {
    ...base,
    id: "state.save-restore.nested-properties",
    requirements: [
      "context.save",
      "context.restore",
      "context.globalAlpha",
      "context.lineWidth",
      "context.lineCap",
      "context.lineJoin",
    ],
    run(a) {
      const c = a.context;
      const read = () =>
        [c.globalAlpha, c.lineWidth, c.lineCap, c.lineJoin] as const;
      const trail: (string | number)[] = [];
      c.globalAlpha = 0.9;
      c.lineWidth = 2;
      c.lineCap = "round";
      c.lineJoin = "round";
      c.save();
      c.globalAlpha = 0.6;
      c.lineWidth = 4;
      c.save();
      c.globalAlpha = 0.3;
      c.lineCap = "butt";
      trail.push(...read());
      c.restore();
      trail.push(...read());
      c.restore();
      trail.push(...read());
      a.assert(
        trail.join(",") === "0.3,4,butt,round,0.6,4,round,round,0.9,2,round,round",
        "nested state restores in order",
      );
      a.observe("trail", trail);
    },
  },
  {
    ...base,
    id: "state.save-restore.extra-restore-noop",
    requirements: ["context.save", "context.restore"],
    run(a) {
      const c = a.context;
      c.globalAlpha = 0.7;
      c.save();
      c.globalAlpha = 0.4;
      c.restore();
      c.restore();
      c.restore();
      a.assert(c.globalAlpha === 0.7, "restores beyond the stack depth are no-ops");
      a.observe("alpha", c.globalAlpha);
    },
  },
];
