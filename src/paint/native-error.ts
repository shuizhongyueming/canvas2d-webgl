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
        ctor as new (message: string, name: string) => Error & { code: number }
      )(message, name);
    } catch {
      /* fall through to the synthetic error */
    }
  }
  return Object.assign(new Error(message), { name, code });
}
