import type { CaseAdapter, CaseDefinition } from "../../types/testing.js";
import { isCompat } from "../shared.js";
import { TRANSPARENT, dumpScene, pixelsEqual } from "../rect/helpers.js";

const base = {
  kind: "semantic" as const,
  width: 32,
  height: 32,
  seed: 1,
  fonts: [] as string[],
};

type ClipContext = CanvasRenderingContext2D;

/** Invoke clip with arguments outside its declared signature. */
export function callClip(
  context: unknown,
  ...args: unknown[]
): unknown {
  return Reflect.apply(
    (context as { clip: (...realArgs: unknown[]) => unknown }).clip,
    context,
    args,
  );
}

function outcome(fn: () => unknown): string {
  try {
    fn();
    return "ok";
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" ? name : "unknown";
  }
}

function message(fn: () => unknown): string {
  try {
    fn();
    return "ok";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function path2D(): unknown {
  const Path2DConstructor = (globalThis as { Path2D?: new () => unknown })
    .Path2D;
  return Path2DConstructor ? new Path2DConstructor() : null;
}

/** Run a state-changing probe without leaking its clip into later asserts. */
function isolated(context: ClipContext, fn: () => unknown): unknown {
  context.save();
  try {
    return fn();
  } finally {
    context.restore();
  }
}

export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "context.clip.contract",
    requirements: ["context.clip"],
    async run(a: CaseAdapter) {
      const context = a.context as ClipContext;
      a.assert(typeof context.clip === "function", "clip is installed");
      a.observe(
        "returnValue",
        isolated(context, () => callClip(context)) === undefined,
      );
      // Exact native enum conversion messages: the compat side must not
      // invent its own wording for legal-but-unsupported or illegal values.
      a.observe("invalidRule", message(() => callClip(context, "foo")));
      a.observe("nullRule", message(() => callClip(context, null)));
      a.observe("numberRule", message(() => callClip(context, 1)));
      a.observe("objectRule", message(() => callClip(context, {})));
      a.observe("symbolRule", message(() => callClip(context, Symbol("x"))));
      // Two arguments select the Path2D overload at the WebIDL layer. Compat
      // reports the unapproved overload; native runs the spec-legal form.
      const path = path2D();
      if (path !== null) {
        const result = outcome(() => isolated(context, () => callClip(context, path)));
        const expected = isCompat(a) ? "unsupported-api" : "ok";
        a.assert(result === expected, "Path2D overload follows approved semantics");
        a.observe("path2d", result === expected ? "as-approved" : result);
        const withRule = outcome(() =>
          isolated(context, () => callClip(context, path, "evenodd")),
        );
        a.assert(
          withRule === expected,
          "Path2D plus rule follows approved semantics",
        );
        a.observe(
          "path2dRule",
          withRule === expected ? "as-approved" : withRule,
        );
        // Two arguments with a non-Path2D first argument fail at overload
        // resolution in both implementations.
        a.observe(
          "twoArguments",
          outcome(() => isolated(context, () => callClip(context, "evenodd", 1))),
        );
      }
      // clip never draws: existing pixels survive the call itself.
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 32, 32);
      context.beginPath();
      context.rect(8, 8, 16, 16);
      a.observe(
        "clipReturn",
        isolated(context, () => callClip(context)) === undefined,
      );
      const scene = await dumpScene(a);
      a.assert(
        scene.count((pixel) => pixelsEqual(pixel, [255, 0, 0, 255])) ===
          32 * 32,
        "clip does not alter painted pixels",
      );
    },
  },
  {
    ...base,
    id: "context.clip.arity-0",
    requirements: ["context.clip"],
    async run(a: CaseAdapter) {
      const context = a.context as ClipContext;
      // A zero-argument clip on an empty path empties the region; keep it
      // isolated so the intersection sequence below starts fresh.
      a.observe("zero", outcome(() => isolated(context, () => callClip(context))));
      context.save();
      context.beginPath();
      context.rect(0, 0, 32, 32);
      a.observe("zeroWithPath", outcome(() => callClip(context)));
      context.beginPath();
      context.rect(4, 4, 24, 24);
      a.observe("intersectAgain", outcome(() => callClip(context)));
      context.beginPath();
      context.rect(8, 8, 16, 16);
      a.observe("thirdClip", outcome(() => callClip(context)));
      context.fillStyle = "#0000ff";
      context.fillRect(0, 0, 32, 32);
      const scene = await dumpScene(a);
      a.assert(
        scene.count((pixel) => pixelsEqual(pixel, [0, 0, 255, 255])) ===
          16 * 16,
        "repeated zero-argument clip intersects the earlier clips",
      );
      a.assert(
        pixelsEqual(scene.pixel(20, 20), [0, 0, 255, 255]),
        "intersection interior is painted",
      );
      a.assert(
        pixelsEqual(scene.pixel(6, 6), TRANSPARENT),
        "first clip ring outside the second clip is not painted",
      );
      context.restore();
    },
  },
  {
    ...base,
    id: "context.clip.arity-1",
    requirements: ["context.clip"],
    async run(a: CaseAdapter) {
      const context = a.context as ClipContext;
      for (const rule of ["evenodd", "nonzero", undefined] as const) {
        const label = rule === undefined ? "undefined" : rule;
        context.save();
        context.beginPath();
        context.rect(0, 0, 32, 32);
        a.observe(label, outcome(() => callClip(context, rule)));
        context.restore();
      }
      // Extra arguments beyond one still select the Path2D overload; the
      // message is the native overload-resolution TypeError.
      a.observe(
        "extraArguments",
        message(() => isolated(context, () => callClip(context, "evenodd", 1))),
      );
    },
  },
  {
    ...base,
    id: "context.clip.value-evenodd",
    requirements: ["context.clip"],
    async run(a: CaseAdapter) {
      const context = a.context as ClipContext;
      // A big rect minus an inner rect: evenodd cuts the hole, nonzero keeps
      // the overlap because both subpaths wind the same way.
      const draw = (rule: "nonzero" | "evenodd") => {
        context.save();
        context.beginPath();
        context.rect(4, 4, 24, 24);
        context.rect(12, 12, 8, 8);
        callClip(context, rule);
        context.fillStyle = "#00ff00";
        context.fillRect(0, 0, 32, 32);
        context.restore();
      };
      draw("evenodd");
      const evenodd = await dumpScene(a);
      a.assert(
        pixelsEqual(evenodd.pixel(8, 8), [0, 255, 0, 255]),
        "evenodd keeps the outer ring",
      );
      a.assert(
        pixelsEqual(evenodd.pixel(16, 16), TRANSPARENT),
        "evenodd cuts the inner hole",
      );
      a.assert(
        pixelsEqual(evenodd.pixel(2, 2), TRANSPARENT),
        "evenodd excludes the region outside the path",
      );
      draw("nonzero");
      const nonzero = await dumpScene(a);
      a.assert(
        pixelsEqual(nonzero.pixel(16, 16), [0, 255, 0, 255]),
        "nonzero keeps the same-direction inner overlap",
      );
    },
  },
];
