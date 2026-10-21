import type { CaseDefinition } from "../../types/testing.js";
import { loadFactory, makeTarget, outcome } from "../shared.js";

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
    id: "canvas.dispose.contract",
    requirements: ["canvas.dispose", "LIFE-01"],
    async run(a) {
      const { createCompatCanvas } = await loadFactory();
      const target = makeTarget();
      const canvas = createCompatCanvas(target);
      const context = canvas.getContext("2d");
      a.assert(!!context, "context exists before dispose");
      canvas.dispose();
      canvas.dispose(); // dispose is idempotent (LIFE-01)
      a.observe("doubleDispose", "tolerated");
      a.observe(
        "getContextAfter",
        outcome(() => canvas.getContext("2d")),
      );
      a.observe(
        "widthReadAfter",
        outcome(() => String(canvas.width)),
      );
      a.observe(
        "widthWriteAfter",
        outcome(() => (canvas.width = 4)),
      );
      // Passthrough members keep working after dispose (LIFE-01).
      canvas.style.setProperty("--c2w-disposed", "1");
      a.observe("styleAfter", canvas.style.getPropertyValue("--c2w-disposed"));
      a.observe("rectAfter", canvas.getBoundingClientRect().width >= 0);
      // The target is never destroyed and its context is never lost by us.
      const gl = target.getContext("webgl") as WebGLRenderingContext | null;
      a.assert(!!gl && !gl.isContextLost(), "target GL context stays alive");
      a.observe("targetGlAlive", !!gl && !gl.isContextLost());
      a.observe(
        "allInterceptedDisposed",
        [
          outcome(() => canvas.getContext("2d")),
          outcome(() => String(canvas.height)),
        ].every((code) => code === "disposed"),
      );
    },
  },
  {
    ...base,
    id: "canvas.dispose.arity-0",
    requirements: ["canvas.dispose"],
    async run(a) {
      const { createCompatCanvas } = await loadFactory();
      const canvas = createCompatCanvas(makeTarget());
      const dispose = canvas.dispose as (...args: unknown[]) => unknown;
      a.assert(
        dispose() === undefined && dispose("extra") === undefined,
        "dispose tolerates extra arguments and returns undefined",
      );
      a.observe("extraArgs", "tolerated");
    },
  },
];
