import type { CaseAdapter, CaseDefinition } from "../../types/testing.js";
import { isCompat } from "../shared.js";

const base = {
  kind: "semantic" as const,
  width: 8,
  height: 8,
  seed: 1,
  fonts: [] as string[],
};

/** Stable identity of a thrown member error: the code when present, else the name. */
function identity(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string") return code;
  const name = (error as { name?: unknown })?.name;
  return typeof name === "string" ? name : "unknown";
}

function message(error: unknown): string {
  const text = (error as { message?: unknown })?.message;
  return typeof text === "string" ? text : "";
}

interface Attempt {
  readonly outcome: string;
  readonly message: string;
}

function attempt(fn: () => unknown): Attempt {
  try {
    fn();
    return { outcome: "ok", message: "" };
  } catch (error) {
    return { outcome: identity(error), message: message(error) };
  }
}

type RawContext = Record<string, unknown>;

function callMember(
  a: CaseAdapter,
  name: string,
  args: readonly unknown[],
): Attempt {
  return attempt(() =>
    Reflect.apply(
      (a.context as unknown as RawContext)[name] as (
        ...realArgs: unknown[]
      ) => unknown,
      a.context,
      [...args],
    ),
  );
}

/**
 * The native side accepts the call. `absent` covers members this Chromium
 * build does not expose (scrollPathIntoView); the run records that platform
 * fact, and it can never stand in for the compat exclusion.
 */
function accepts(a: CaseAdapter, result: Attempt): boolean {
  return !isCompat(a) && (result.outcome === "ok" || result.outcome === "absent");
}

/** The compat side must report the approved exclusion and name the member. */
function excludes(a: CaseAdapter, name: string, result: Attempt): boolean {
  return (
    isCompat(a) &&
    result.outcome === "unsupported-api" &&
    result.message.includes(name)
  );
}

function approved(a: CaseAdapter, name: string, result: Attempt): boolean {
  return accepts(a, result) || excludes(a, name, result);
}

/**
 * Excluded context methods: every one of them is spec-legal, so the native
 * side must run and the compat side must instead raise `unsupported-api` whose
 * message names the API. Both adapters run the same assertions with the same
 * messages; only the adapter's own side decides which expectation applies.
 */
const METHODS: readonly {
  readonly name: string;
  readonly args: () => readonly unknown[];
}[] = [
  { name: "getImageData", args: () => [0, 0, 1, 1] },
  { name: "putImageData", args: () => [new ImageData(1, 1), 0, 0] },
  { name: "createImageData", args: () => [1, 1] },
  { name: "bezierCurveTo", args: () => [0, 0, 1, 1, 2, 2] },
  { name: "createRadialGradient", args: () => [0, 0, 1, 0, 0, 2] },
  { name: "createConicGradient", args: () => [0, 0, 0] },
  { name: "setLineDash", args: () => [[1, 2]] },
  { name: "getLineDash", args: () => [] },
  { name: "resetTransform", args: () => [] },
  { name: "transform", args: () => [1, 0, 0, 1, 1, 1] },
  { name: "getTransform", args: () => [] },
  { name: "isPointInPath", args: () => [0, 0] },
  { name: "isPointInStroke", args: () => [0, 0] },
  { name: "roundRect", args: () => [0, 0, 2, 2] },
  { name: "reset", args: () => [] },
  { name: "drawFocusIfNeeded", args: () => [document.createElement("div")] },
  { name: "scrollPathIntoView", args: () => [] },
  { name: "getContextAttributes", args: () => [] },
  { name: "isContextLost", args: () => [] },
];

/**
 * Excluded context properties: both access directions are checked, read
 * first so a compat setter cannot mask its getter. Neither side may report
 * success for the excluded member.
 */
const PROPERTIES: readonly {
  readonly name: string;
  readonly value: unknown;
}[] = [
  { name: "imageSmoothingEnabled", value: true },
  { name: "imageSmoothingQuality", value: "high" },
  { name: "shadowBlur", value: 2 },
  { name: "shadowColor", value: "#ff0000" },
  { name: "shadowOffsetX", value: 1 },
  { name: "shadowOffsetY", value: 1 },
  { name: "miterLimit", value: 4 },
  { name: "lineDashOffset", value: 1 },
  { name: "direction", value: "rtl" },
  { name: "fontKerning", value: "normal" },
  { name: "fontStretch", value: "condensed" },
  { name: "fontVariantCaps", value: "small-caps" },
  { name: "textRendering", value: "optimizeLegibility" },
  { name: "letterSpacing", value: "1px" },
  { name: "wordSpacing", value: "1px" },
  { name: "lang", value: "en" },
];

export const cases: CaseDefinition[] = [
  ...METHODS.map(
    (member): CaseDefinition => ({
      ...base,
      id: `context.${member.name}.contract`,
      requirements: [`context.${member.name}`],
      run(a) {
        const fn = (a.context as unknown as RawContext)[member.name];
        const result: Attempt =
          typeof fn === "function"
            ? callMember(a, member.name, member.args())
            : { outcome: "absent", message: "" };
        const ok = approved(a, member.name, result);
        a.assert(ok, "member follows the approved exclusion");
        a.observe("call", ok ? "as-approved" : result.outcome);
      },
    }),
  ),
  ...PROPERTIES.map(
    (member): CaseDefinition => ({
      ...base,
      id: `context.${member.name}.contract`,
      requirements: [`context.${member.name}`],
      run(a) {
        const target = a.context as unknown as RawContext;
        const read = attempt(() => target[member.name]);
        const write = attempt(() => {
          target[member.name] = member.value;
        });
        const ok = approved(a, member.name, read) && approved(a, member.name, write);
        a.assert(ok, "member follows the approved exclusion");
        a.observe(
          "access",
          ok ? "as-approved" : `${read.outcome}/${write.outcome}`,
        );
      },
    }),
  ),
];
