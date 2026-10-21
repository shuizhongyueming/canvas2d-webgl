/**
 * Native-style DOMException for supported-API input errors. Runtimes without a
 * DOMException global get a plain Error carrying the same name and code.
 */
export function nativeException(
  name: "IndexSizeError" | "SyntaxError" | "InvalidStateError",
  code: number,
  message: string,
): Error & { code: number } {
  const ctor = (globalThis as { DOMException?: unknown }).DOMException;
  if (typeof ctor === "function") {
    try {
      return new (
        ctor as new (
          message: string,
          name: string,
        ) => Error & { code: number }
      )(message, name);
    } catch {
      /* fall through to the synthetic error */
    }
  }
  return Object.assign(new Error(message), { name, code });
}

/**
 * WebIDL DOMString conversion: symbols throw a TypeError, everything else
 * stringifies (null -> "null", objects -> "[object Object]", ...).
 */
export function webidlString(value: unknown): string {
  if (typeof value === "symbol") {
    throw new TypeError("Cannot convert a Symbol value to a string");
  }
  return String(value);
}

/**
 * WebIDL double conversion: BigInt throws a TypeError, everything else
 * coerces with Number (numeric strings, null, booleans, ...).
 */
export function webidlDouble(value: unknown): number {
  if (typeof value === "bigint") {
    throw new TypeError("Cannot convert a BigInt value to a number");
  }
  return Number(value);
}
