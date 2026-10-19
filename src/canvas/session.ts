import type {
  GPUDevice,
  PathStore,
  Rasterizer,
  StateStore,
} from "../internal/contracts.js";
import { createCompatError, ERROR_CODES } from "../contracts/errors.js";

export interface SessionParts {
  readonly device: GPUDevice;
  readonly raster: Rasterizer;
  readonly state: StateStore;
  readonly path: PathStore;
  readonly onContextLost: (() => void) | undefined;
  readonly onContextRestored: (() => void) | undefined;
}

/**
 * The single entry point through which the public canvas reaches the state,
 * path, raster and device modules for resize, context loss and disposal.
 * DOM event wiring and the full lost/restore orchestration arrive with the
 * lifecycle ticket; every lifecycle concern enters through here.
 */
export interface CanvasSession {
  readonly disposed: boolean;
  resize(width: number, height: number): void;
  notifyLost(): void;
  notifyRestored(): void;
  dispose(): void;
}

export function createSession(parts: SessionParts): CanvasSession {
  const { device, raster, state, path } = parts;
  let disposed = false;
  return {
    get disposed() {
      return disposed;
    },
    resize(width: number, height: number): void {
      if (disposed)
        throw createCompatError(ERROR_CODES.DISPOSED, "canvas is disposed");
      // While the context is lost, sizing is silently ineffective and never
      // queued, matching the approved context-lost semantics.
      if (device.status === "lost") return;
      // The device validates first: a rejected size leaves state untouched.
      device.resize(width, height);
      state.reset();
      path.reset();
      raster.clearCache();
    },
    notifyLost(): void {
      if (disposed || device.status !== "active") return;
      device.lose();
      parts.onContextLost?.();
    },
    notifyRestored(): void {
      if (disposed || device.status !== "lost") return;
      device.restore();
      raster.clearCache();
      parts.onContextRestored?.();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      device.dispose();
      raster.dispose();
    },
  };
}
