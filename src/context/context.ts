import type { CompatContext } from "../api.js";
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
  return Object.create(null, contextDescriptors(features)) as CompatContext;
}
