// Test-side integration seam. GPU/facade owners replace this function with an
// import of their private instance->TestHooks lookup. Never expose hooks publicly.
export function hooksFor(_compatCanvas) {
  throw Object.assign(new Error("GPU test hooks are not implemented"), {
    code: "test-hooks-unavailable",
  });
}
