/** Internal entry points for the facade and feature tickets; not a package export. */
export { createSceneRenderer } from "./device.js";
export type { SceneRenderer, SceneRendererOptions } from "./device.js";
export { APPROVED_CONTEXT_ATTRIBUTES } from "./context.js";
export { registerTestHooks, lookupTestHooks } from "./hooks.js";
export type { SceneTestHooks } from "./hooks.js";
