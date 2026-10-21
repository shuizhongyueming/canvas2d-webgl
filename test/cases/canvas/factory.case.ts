import type { CaseDefinition } from "../../types/testing.js";
import type { NativeCanvas } from "../../../src/api.js";
import { loadFactory, makeTarget, outcome } from "../shared.js";

const base = {
  kind: "semantic" as const,
  width: 8,
  height: 8,
  seed: 1,
  fonts: [] as string[],
};

type Factory = (width: number, height: number) => NativeCanvas;

/** A syntactically valid factory whose canvas never yields a 2D context. */
const without2d: Factory = () =>
  ({
    width: 4,
    height: 3,
    getContext: () => null,
  }) as unknown as NativeCanvas;

export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "canvas.factory.default",
    requirements: ["CAN-01"],
    async run(a) {
      const { createCompatCanvas } = await loadFactory();
      const target = makeTarget(8, 6);
      const canvas = createCompatCanvas(target);
      const context = canvas.getContext("2d");
      a.assert(!!context, "default creation succeeds");
      a.assert(
        canvas.getContext("2d") === context,
        "context identity is stable",
      );
      a.assert(context.canvas === canvas, "context.canvas is the facade");
      a.assert(
        canvas.width === 8 && canvas.height === 6,
        "facade exposes the target size",
      );
      a.observe("boundToWebGL", target.getContext("webgl") !== null);
      a.observe("size", [canvas.width, canvas.height]);
      canvas.dispose();
    },
  },
  {
    ...base,
    id: "canvas.factory.injected",
    requirements: ["CAN-01", "REN-02"],
    async run(a) {
      const { createCompatCanvas } = await loadFactory();
      const created: HTMLCanvasElement[] = [];
      const factory: Factory = (width, height) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        created.push(canvas);
        return canvas;
      };
      const canvas = createCompatCanvas(makeTarget(), {
        createOffscreenCanvas: factory,
        onContextLost: () => undefined,
        onContextRestored: () => undefined,
      });
      a.assert(
        created.length >= 1,
        "the injected factory is exercised synchronously at creation",
      );
      a.assert(
        new Set(created).size === created.length,
        "every factory call produced an independent canvas",
      );
      a.observe("probed", created.length >= 1);
      a.observe("independent", new Set(created).size === created.length);
      a.observe("contextReady", !!canvas.getContext("2d"));
      canvas.dispose();
    },
  },
  {
    ...base,
    id: "canvas.factory.invalid",
    requirements: ["CAN-01"],
    async run(a) {
      const { createCompatCanvas } = await loadFactory();
      const scenarios: Array<[string, (target: HTMLCanvasElement) => Factory]> =
        [
          ["null", () => (() => null) as unknown as Factory],
          ["plainObject", () => (() => ({})) as unknown as Factory],
          [
            "noGetContext",
            () => (() => ({ width: 4, height: 3 })) as unknown as Factory,
          ],
          ["targetItself", (target) => (() => target) as unknown as Factory],
          [
            "nonIndependent",
            () => {
              const shared = makeTarget(4, 3);
              return (() => shared) as unknown as Factory;
            },
          ],
          [
            "wrongDimensions",
            () => (() => makeTarget(1, 1)) as unknown as Factory,
          ],
          [
            "throws",
            () =>
              (() => {
                throw new Error("factory boom");
              }) as unknown as Factory,
          ],
          ["without2d", () => without2d],
          ["notAFunction", () => 42 as unknown as Factory],
        ];
      const results: Record<string, string> = {};
      for (const [name, makeFactory] of scenarios) {
        const target = makeTarget();
        results[name] = outcome(() =>
          createCompatCanvas(target, {
            createOffscreenCanvas: makeFactory(target),
          }),
        );
      }
      const expected: Record<string, string> = {
        null: "invalid-factory",
        plainObject: "invalid-factory",
        noGetContext: "invalid-factory",
        targetItself: "invalid-factory",
        nonIndependent: "invalid-factory",
        wrongDimensions: "invalid-factory",
        throws: "invalid-factory",
        without2d: "capability-unavailable",
        notAFunction: "invalid-factory",
      };
      for (const [name, code] of Object.entries(expected))
        a.assert(results[name] === code, `${name} reports ${code}`);
      a.observe("codes", results);
    },
  },
  {
    ...base,
    id: "canvas.target.invalid",
    requirements: ["CAN-01"],
    async run(a) {
      const { createCompatCanvas } = await loadFactory();
      a.observe(
        "nullTarget",
        outcome(() => createCompatCanvas(null as never)),
      );
      a.observe(
        "plainObject",
        outcome(() => createCompatCanvas({} as never)),
      );
      a.observe(
        "noGetContext",
        outcome(() => createCompatCanvas({ width: 1, height: 1 } as never)),
      );
      a.observe(
        "primitiveOptions",
        outcome(() => createCompatCanvas(makeTarget(), 42 as never)),
      );
      a.assert(
        outcome(() => createCompatCanvas(null as never)) === "invalid-target",
        "a null target reports invalid-target",
      );
    },
  },
  {
    ...base,
    id: "canvas.target.bound-2d",
    requirements: ["CAN-01"],
    async run(a) {
      const { createCompatCanvas } = await loadFactory();
      const target = makeTarget();
      a.assert(!!target.getContext("2d"), "target binds a native 2D context");
      a.observe(
        "code",
        outcome(() => createCompatCanvas(target)),
      );
      a.assert(
        outcome(() => createCompatCanvas(target)) === "webgl-unavailable",
        "a 2D-bound target reports webgl-unavailable",
      );
      a.observe("callerBindingUntouched", target.getContext("2d") !== null);
    },
  },
  {
    ...base,
    id: "canvas.target.prebound-webgl",
    requirements: ["CAN-01"],
    async run(a) {
      const { createCompatCanvas } = await loadFactory();
      const target = makeTarget();
      const gl = target.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: true,
        stencil: true,
        preserveDrawingBuffer: false,
      });
      if (!gl) a.skip("webgl-unavailable");
      const canvas = createCompatCanvas(target);
      a.assert(
        !!canvas.getContext("2d"),
        "pre-bound conforming WebGL is accepted",
      );
      a.observe("sameContext", target.getContext("webgl") === gl);
      a.observe("ready", true);
      canvas.dispose();
    },
  },
  {
    ...base,
    id: "canvas.target.prebound-webgl-mismatch",
    requirements: ["CAN-01"],
    async run(a) {
      const { createCompatCanvas } = await loadFactory();
      const target = makeTarget();
      const gl = target.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: true,
        stencil: false,
        preserveDrawingBuffer: false,
      });
      if (!gl) a.skip("webgl-unavailable");
      const bound = gl as WebGLRenderingContext;
      const code = outcome(() => createCompatCanvas(target));
      a.assert(
        code === "context-attributes-mismatch",
        "mismatched pre-bound attributes report context-attributes-mismatch",
      );
      a.observe("code", code);
      a.observe(
        "callerContextAlive",
        target.getContext("webgl") === bound && !bound.isContextLost(),
      );
    },
  },
  {
    ...base,
    id: "canvas.creation.failure-cleanup",
    requirements: ["CAN-01"],
    async run(a) {
      const { createCompatCanvas } = await loadFactory();
      const target = makeTarget();
      const failed = outcome(() =>
        createCompatCanvas(target, {
          createOffscreenCanvas: (() => null) as unknown as Factory,
        }),
      );
      a.assert(failed === "invalid-factory", "the factory failure is reported");
      a.observe("failed", failed);
      a.observe("targetUnbound", target.getContext("2d") !== null);
      const retry = createCompatCanvas(makeTarget());
      a.assert(!!retry.getContext("2d"), "creation after a failure succeeds");
      retry.dispose();
      let cycles = 0;
      for (let index = 0; index < 8; index += 1) {
        const canvas = createCompatCanvas(makeTarget(4, 4));
        canvas.dispose();
        cycles += 1;
      }
      a.observe("createDisposeCycles", cycles);
    },
  },
];
