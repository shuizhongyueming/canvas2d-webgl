import type { CompatCanvas, CompatContext, TargetCanvas } from "../api.js";
import type { GPUDevice } from "../internal/contracts.js";
import {
  createCompatError,
  ERROR_CODES,
  type ErrorCode,
} from "../contracts/errors.js";
import type { CanvasSession } from "./session.js";

/** Export/readback entries are excluded at runtime exactly as the type Omits them. */
const EXCLUDED: ReadonlySet<string> = new Set([
  "toDataURL",
  "toBlob",
  "captureStream",
  "transferControlToOffscreen",
]);

function disposedError(): Error & { code: ErrorCode } {
  return createCompatError(ERROR_CODES.DISPOSED, "canvas is disposed");
}

/**
 * WebIDL unsigned long conversion for canvas dimensions: BigInt and Symbol
 * reject with a TypeError, non-finite numbers become 0, and the rest wrap
 * modulo 2^32. The device then approves or rejects the concrete size.
 */
export function toCanvasDimension(value: unknown): number {
  if (typeof value === "bigint")
    throw new TypeError("Cannot convert a BigInt value to a number");
  return Number(value as number) >>> 0;
}

interface BoundMethod {
  readonly raw: (...args: never[]) => unknown;
  readonly bound: (...args: unknown[]) => unknown;
}

/**
 * Wrap the target canvas with the three-way split: intercepted members
 * (getContext, width/height, dispose) implement library semantics, excluded
 * members report unsupported-api, and every other property or method passes
 * through to the real target with the target as receiver, so DOM behavior
 * (style, events, layout) is exactly the platform's own.
 */
export function createFacade<T extends TargetCanvas>(
  target: T,
  session: CanvasSession,
  device: GPUDevice,
  context: CompatContext<T>,
): CompatCanvas<T> {
  const boundMethods = new Map<PropertyKey, BoundMethod>();
  const excludedStubs = new Map<string, () => never>();

  const getContext = (...args: readonly unknown[]): CompatContext<T> | null => {
    if (session.disposed) throw disposedError();
    if (args.length === 0)
      throw new TypeError(
        "Failed to execute 'getContext' on 'HTMLCanvasElement': 1 argument required, but only 0 present.",
      );
    // WebIDL DOMString conversion rejects Symbols with a native TypeError.
    if (typeof args[0] === "symbol")
      throw new TypeError(
        "Failed to execute 'getContext' on 'HTMLCanvasElement': Cannot convert a Symbol value to a string",
      );
    // An undefined/null second argument is an absent optional dictionary and
    // equals the one-argument form; any real attributes dictionary is a
    // spec-legal overload outside the approved matrix.
    if (args.length > 1 && args[1] !== undefined && args[1] !== null)
      throw createCompatError(
        ERROR_CODES.UNSUPPORTED_API,
        "getContext: context attributes argument",
      );
    const type = typeof args[0] === "string" ? args[0] : String(args[0]);
    return type === "2d" ? context : null;
  };

  const dispose = (): void => {
    session.dispose();
  };

  const excludedStub = (name: string): (() => never) => {
    let stub = excludedStubs.get(name);
    if (!stub) {
      stub = () => {
        throw createCompatError(ERROR_CODES.UNSUPPORTED_API, name);
      };
      excludedStubs.set(name, stub);
    }
    return stub;
  };

  const handler: ProxyHandler<T> = {
    get(targetCanvas, property, _receiver) {
      if (property === "getContext") return getContext;
      if (property === "dispose") return dispose;
      if (property === "width" || property === "height") {
        if (session.disposed) throw disposedError();
        return property === "width" ? device.width : device.height;
      }
      if (typeof property === "string" && EXCLUDED.has(property))
        return excludedStub(property);
      const value = Reflect.get(targetCanvas, property, targetCanvas);
      if (typeof value !== "function") return value;
      // Passthrough methods run with the real target as receiver; DOM getters
      // and methods reject any other receiver, and identity stays stable.
      const cached = boundMethods.get(property);
      if (cached && cached.raw === value) return cached.bound;
      const bound = Function.prototype.bind.call(
        value,
        targetCanvas,
      ) as (...args: unknown[]) => unknown;
      boundMethods.set(property, {
        raw: value as (...args: never[]) => unknown,
        bound,
      });
      return bound;
    },
    set(targetCanvas, property, value) {
      if (property === "width" || property === "height") {
        if (session.disposed) throw disposedError();
        const size = toCanvasDimension(value);
        if (property === "width") session.resize(size, device.height);
        else session.resize(device.width, size);
        return true;
      }
      return Reflect.set(targetCanvas, property, value, targetCanvas);
    },
    has(targetCanvas, property) {
      if (
        property === "getContext" ||
        property === "dispose" ||
        property === "width" ||
        property === "height" ||
        (typeof property === "string" && EXCLUDED.has(property))
      )
        return true;
      return Reflect.has(targetCanvas, property);
    },
  };
  return new Proxy(target, handler) as unknown as CompatCanvas<T>;
}
