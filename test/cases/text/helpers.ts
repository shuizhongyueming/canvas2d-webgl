/**
 * Text case helpers. Scene/display observation reuses the rect helpers
 * verbatim; module scope stays Node-safe: only run() executes in a page.
 */

/** Call a text method outside its declared signature (arity/type edges). */
export function callText(
  context: unknown,
  method: "fillText" | "strokeText" | "measureText",
  ...args: unknown[]
): unknown {
  return Reflect.apply(
    (context as Record<string, (...realArgs: unknown[]) => unknown>)[method]!,
    context,
    args,
  );
}

export {
  dumpScene,
  pixelsEqual,
  rectOutcome as textOutcome,
  rectMessage as textMessage,
  TRANSPARENT,
} from "../rect/helpers.js";
export type { Pixel, SceneDump } from "../rect/helpers.js";

/** The paint-style union resists direct assignment; paint cases use this seam too. */
export function assignStyle(
  context: unknown,
  property: "fillStyle" | "strokeStyle",
  value: unknown,
): void {
  (context as unknown as Record<string, unknown>)[property] = value;
}
