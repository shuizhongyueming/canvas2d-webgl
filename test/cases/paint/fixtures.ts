/**
 * Shared paint case fixtures. Module scope stays Node-safe: the catalog
 * imports case modules in Node to read definitions; only run() executes in a
 * browser page.
 */

/** 3x5 NPOT tile: vertical stripes red | green | blue, fully opaque. */
export const STRIPES_3x5 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAAFCAYAAACAcVaiAAAAHUlEQVR4AU3BsQ0AAAzDIJT/f3bXgkii5plnnnkOW/gGA3oXmjIAAAAASUVORK5CYII=";

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("fixture image failed to load"));
    image.src = src;
  });
}

/** Record a thrown error's stable identity; never compares stacks/messages. */
export function errorInfo(fn: () => unknown): Record<string, string | number> {
  try {
    const value = fn();
    return { result: value === null ? "null" : typeof value };
  } catch (error) {
    const info: Record<string, string | number> = {
      name: (error as { name?: string })?.name ?? typeof error,
    };
    const code = (error as { code?: unknown })?.code;
    if (typeof code === "number" || typeof code === "string") {
      info.code = code;
    }
    return info;
  }
}

/**
 * Invoke a method outside its declared TypeScript signature (arity and
 * argument-type violations are part of native semantics under test).
 */
export function callRaw(
  target: object,
  method: string,
  ...args: unknown[]
): unknown {
  return Reflect.apply(
    (target as Record<string, (...realArgs: unknown[]) => unknown>)[method]!,
    target,
    args,
  );
}
