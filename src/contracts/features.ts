import type { FeatureDefinition } from "../internal/contracts.js";
import { SUPPORT_MATRIX, lookupMember } from "./support.js";
import { createCompatError, ERROR_CODES } from "./errors.js";

/**
 * Construct descriptors before touching a private context object. No global
 * registry: one collection per canvas, validated atomically before installation.
 *
 * `guard` runs before every installed member: it is how the assembly layer
 * enforces one disposal rule for the whole surface instead of leaving each
 * feature to decide when to check. Because it runs first, a disposed canvas
 * reports `disposed` even when the call would also have failed argument
 * conversion or been a silent no-op.
 */
export function contextDescriptors(
  features: readonly FeatureDefinition[],
  guard?: () => void,
): PropertyDescriptorMap {
  const members = new Map<string, PropertyDescriptor>();
  const ids = new Set<string>();
  for (const feature of features) {
    if (!feature.id || ids.has(feature.id))
      fail(`duplicate or empty feature: ${feature.id}`);
    ids.add(feature.id);
    for (const [name, descriptor] of Object.entries(feature.members)) {
      const row = lookupMember("context", name);
      if (
        !row ||
        row.policy === "unsupported" ||
        row.owner !== feature.id ||
        members.has(name)
      ) {
        fail(`invalid ownership: ${feature.id}.${name}`);
      }
      if (row.kind === "method") {
        if (
          typeof descriptor.value !== "function" ||
          "get" in descriptor ||
          "set" in descriptor
        )
          fail(`invalid method: ${name}`);
      } else {
        if (
          "value" in descriptor ||
          "writable" in descriptor ||
          typeof descriptor.get !== "function"
        )
          fail(`invalid property: ${name}`);
        if (
          row.policy === "readonly"
            ? descriptor.set !== undefined
            : typeof descriptor.set !== "function"
        )
          fail(`invalid setter: ${name}`);
      }
      members.set(name, {
        ...(guard ? guarded(descriptor, guard) : descriptor),
        configurable: false,
        enumerable: true,
      });
    }
  }
  const descriptors: PropertyDescriptorMap = Object.create(null);
  for (const row of SUPPORT_MATRIX.filter((row) => row.target === "context")) {
    const errorCode =
      row.policy === "unsupported"
        ? ERROR_CODES.UNSUPPORTED_API
        : ERROR_CODES.NOT_IMPLEMENTED;
    const unavailable = () => {
      throw createCompatError(errorCode, row.name);
    };
    descriptors[row.name] =
      members.get(row.name) ||
      (row.kind === "method"
        ? {
            value: unavailable,
            enumerable: true,
            configurable: false,
            writable: false,
          }
        : {
            get: unavailable,
            ...(row.policy === "readonly" ? {} : { set: unavailable }),
            enumerable: true,
            configurable: false,
          });
  }
  return descriptors;
}

function fail(detail: string): never {
  throw createCompatError(ERROR_CODES.CONTRACT, detail);
}

/**
 * Wrap one installed member so `guard` runs before any of its work. The
 * wrapper keeps the original arity: the support matrix is expressed in
 * argument counts, and browsers expose those counts through `.length`.
 */
function guarded(
  descriptor: PropertyDescriptor,
  guard: () => void,
): PropertyDescriptor {
  if (typeof descriptor.value === "function") {
    const impl = descriptor.value as (...args: unknown[]) => unknown;
    const wrapper = function (this: unknown, ...args: unknown[]): unknown {
      guard();
      return impl.apply(this, args);
    };
    Object.defineProperty(wrapper, "length", {
      value: impl.length,
      configurable: true,
    });
    return { ...descriptor, value: wrapper };
  }
  const { get, set } = descriptor;
  return {
    ...descriptor,
    get: get
      ? function (this: unknown): unknown {
          guard();
          return get.call(this);
        }
      : undefined,
    set: set
      ? function (this: unknown, value: unknown): void {
          guard();
          set.call(this, value);
        }
      : undefined,
  };
}
