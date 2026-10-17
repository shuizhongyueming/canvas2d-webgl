import { createCompatError, ERROR_CODES } from "./contracts/errors.js";
import type { TargetCanvas, CompatOptions, CompatCanvas } from "./api.js";
export type * from "./api.js";
/** Approved public factory; rendering remains explicitly unimplemented. */
export function createCompatCanvas<T extends TargetCanvas>(
  targetCanvas: T,
  options?: CompatOptions,
): CompatCanvas<T> {
  throw createCompatError(
    ERROR_CODES.NOT_IMPLEMENTED,
    "createCompatCanvas: renderer implementation pending",
  );
}
