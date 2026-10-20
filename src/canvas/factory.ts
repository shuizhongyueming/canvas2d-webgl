import type {
  CompatCanvas,
  CompatContext,
  CompatOptions,
  NativeCanvas,
  TargetCanvas,
} from "../api.js";
import type {
  FeatureEnvironment,
  FeatureFactory,
} from "../internal/contracts.js";
import {
  createCompatError,
  ERROR_CODES,
  rollbackInitialization,
} from "../contracts/errors.js";
import { createSceneRenderer, registerTestHooks } from "../gpu/index.js";
import { createContext } from "../context/context.js";
import { stateFeature } from "../context/feature.js";
import { createStateStore } from "../context/state.js";
import { rectFeature } from "../features/rect/feature.js";
import { PathRecorder } from "../path/recorder.js";
import { createRasterizer } from "../raster/rasterizer.js";
import {
  DEFAULT_STYLE_IDS,
  defaultStylePaint,
  paintFeature,
} from "../paint/index.js";
import {
  resolveOffscreenFactory,
  validateOffscreenFactory,
} from "./offscreen.js";
import { createSession } from "./session.js";
import { createFacade } from "./facade.js";

interface NormalizedOptions {
  readonly createOffscreenCanvas:
    | ((width: number, height: number) => NativeCanvas)
    | undefined;
  readonly onContextLost: (() => void) | undefined;
  readonly onContextRestored: (() => void) | undefined;
}

/** undefined/null mean "no options", like a WebIDL dictionary argument. */
function normalizeOptions(options: CompatOptions | undefined): NormalizedOptions {
  if (options === undefined || options === null)
    return {
      createOffscreenCanvas: undefined,
      onContextLost: undefined,
      onContextRestored: undefined,
    };
  if (typeof options !== "object")
    throw new TypeError("createCompatCanvas: options must be an object");
  const { createOffscreenCanvas, onContextLost, onContextRestored } = options;
  if (onContextLost !== undefined && typeof onContextLost !== "function")
    throw new TypeError("createCompatCanvas: onContextLost must be a function");
  if (onContextRestored !== undefined && typeof onContextRestored !== "function")
    throw new TypeError(
      "createCompatCanvas: onContextRestored must be a function",
    );
  return { createOffscreenCanvas, onContextLost, onContextRestored };
}

function validateTarget(target: TargetCanvas): void {
  if (
    !target ||
    typeof target !== "object" ||
    typeof target.getContext !== "function" ||
    typeof target.width !== "number" ||
    typeof target.height !== "number"
  )
    throw createCompatError(
      ERROR_CODES.INVALID_TARGET,
      "target must be a canvas with getContext and numeric dimensions",
    );
}

/**
 * Approved public factory. Creation runs input validation, offscreen-factory
 * proof, GPU capability detection and allocation, then member installation;
 * any mid-way failure drains the registered cleanups and rethrows the
 * original error, so a half-initialized canvas is never returned.
 */
export function createCompatCanvas<T extends TargetCanvas>(
  targetCanvas: T,
  options?: CompatOptions,
): CompatCanvas<T> {
  validateTarget(targetCanvas);
  const normalized = normalizeOptions(options);
  const offscreenFactory = resolveOffscreenFactory(
    normalized.createOffscreenCanvas,
  );
  validateOffscreenFactory(offscreenFactory, targetCanvas);
  const cleanups: Array<() => void> = [];
  try {
    const renderer = createSceneRenderer(targetCanvas, {
      createProbeCanvas: () => offscreenFactory(1, 1),
    });
    cleanups.push(() => renderer.device.dispose());
    const { device, presenter, resources, hooks } = renderer;
    const state = createStateStore({
      fill: defaultStylePaint(DEFAULT_STYLE_IDS.fill),
      stroke: defaultStylePaint(DEFAULT_STYLE_IDS.stroke),
    });
    const path = new PathRecorder();
    const raster = createRasterizer({
      createCanvas: offscreenFactory,
      sceneExtent: () => ({ width: device.width, height: device.height }),
    });
    cleanups.push(() => raster.dispose());
    const session = createSession({
      device,
      raster,
      state,
      path,
      onContextLost: normalized.onContextLost,
      onContextRestored: normalized.onContextRestored,
    });
    const environment: FeatureEnvironment = {
      state,
      path,
      raster,
      gpu: device,
      presenter,
      resources,
      // Already resolved and proven by validateOffscreenFactory; the paint
      // feature captures pattern bitmaps through it (decision #36).
      createOffscreenCanvas: offscreenFactory,
    };
    let facade!: CompatCanvas<T>;
    // ctx.canvas closes over the facade, assigned before this factory returns;
    // the context object cannot escape earlier.
    const canvasFeature: FeatureFactory = () => ({
      id: "canvas",
      members: { canvas: { get: () => facade } },
    });
    const context = createContext(environment, [
      stateFeature,
      paintFeature,
      rectFeature,
      canvasFeature,
    ]) as CompatContext<T>;
    facade = createFacade(targetCanvas, session, device, context);
    registerTestHooks(facade, hooks);
    return facade;
  } catch (failure) {
    rollbackInitialization(failure, cleanups);
  }
}
