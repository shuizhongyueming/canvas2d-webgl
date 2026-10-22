import type { CompatContext } from "../api.js";
import { createCompatError, ERROR_CODES } from "../contracts/errors.js";
import { contextDescriptors } from "../contracts/features.js";
import type {
  FeatureEnvironment,
  FeatureFactory,
} from "../internal/contracts.js";

/**
 * Assemble the compat context for one canvas. The feature list is explicit per
 * creation (no global registry); members with no owning feature are installed
 * as not-implemented or unsupported-api stubs, and unknown spellings stay absent.
 */
export function createContext(
  environment: FeatureEnvironment,
  factories: readonly FeatureFactory[],
): CompatContext {
  const features = factories.map((factory) => factory(environment));
  // One disposal rule for every installed member: after dispose() the canvas
  // has stopped all library work, so an intercepted member reports `disposed`
  // before it converts arguments or decides the call is a no-op.
  const guard = (): void => {
    // A partial environment (feature-level tests assemble one feature only)
    // has no device; production assembly always provides it.
    if (environment.gpu?.status === "disposed")
      throw createCompatError(ERROR_CODES.DISPOSED, "canvas is disposed");
  };
  return Object.create(
    null,
    contextDescriptors(features, guard),
  ) as CompatContext;
}
