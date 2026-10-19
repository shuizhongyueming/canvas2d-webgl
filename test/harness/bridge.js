// Test-side integration seam. The GPU ticket owns the private instance->hooks
// registry; the public canvas factory registers each compat canvas at creation.
// Never expose hooks publicly or through package exports.
import { lookupTestHooks } from "../../dist/gpu/hooks.js";
export function hooksFor(compatCanvas) {
  const hooks = lookupTestHooks(compatCanvas);
  if (!hooks)
    throw Object.assign(new Error("GPU test hooks are not registered"), {
      code: "test-hooks-unavailable",
    });
  return hooks;
}
