import type {
  GPUDevice,
  PathStore,
  Rasterizer,
  StateStore,
} from "../internal/contracts.js";
import { createCompatError, ERROR_CODES } from "../contracts/errors.js";
import type { LifecycleRegistry } from "./registry.js";

export interface SessionParts {
  readonly device: GPUDevice;
  readonly raster: Rasterizer;
  readonly state: StateStore;
  readonly path: PathStore;
  readonly lifecycle: LifecycleRegistry;
  /**
   * The caller's canvas. Only the standard DOM event target surface is used;
   * platforms without addEventListener still get direct notifyLost/Restored.
   */
  readonly target: unknown;
  readonly onContextLost: (() => void) | undefined;
  readonly onContextRestored: (() => void) | undefined;
}

/** The subset of a DOM event the lifecycle needs (real events call preventDefault). */
export interface ContextEvent {
  preventDefault?(): void;
}

export interface ContextEventTarget {
  addEventListener(type: string, listener: (event: ContextEvent) => void): void;
  removeEventListener(
    type: string,
    listener: (event: ContextEvent) => void,
  ): void;
}

const CONTEXT_LOST = "webglcontextlost";
const CONTEXT_RESTORED = "webglcontextrestored";

function asEventTarget(target: unknown): ContextEventTarget | null {
  if (!target || typeof target !== "object") return null;
  const candidate = target as Record<string, unknown>;
  return typeof candidate.addEventListener === "function" &&
    typeof candidate.removeEventListener === "function"
    ? (target as ContextEventTarget)
    : null;
}

/** Run every step, then rethrow the first failure (ResourceOwner semantics). */
function drain(steps: readonly (() => void)[]): void {
  let failed = false;
  let failure: unknown;
  for (const step of steps) {
    try {
      step();
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
  }
  if (failed) throw failure;
}

/**
 * The single entry point through which the public canvas reaches the state,
 * path, raster and device modules for resize, context loss, restoration and
 * disposal.
 *
 * Every transition follows the same order: validate/rebuild through the shared
 * modules, discard derived state, run feature hooks, then notify the caller.
 * Nothing is queued while lost; a size assignment in that window is silently
 * ineffective, exactly like a native context-lost canvas.
 */
export interface CanvasSession {
  readonly disposed: boolean;
  resize(width: number, height: number): void;
  notifyLost(): void;
  notifyRestored(): void;
  dispose(): void;
}

export function createSession(parts: SessionParts): CanvasSession {
  const { device, raster, state, path, lifecycle } = parts;
  const eventTarget = asEventTarget(parts.target);
  let disposed = false;

  const onLost = (event: ContextEvent): void => {
    // Native restoration is only allowed when the loss is handled; the library
    // owns that handling, so cancel the event before pausing.
    event.preventDefault?.();
    session.notifyLost();
  };
  const onRestored = (): void => {
    session.notifyRestored();
  };

  const session: CanvasSession = {
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
      // A successful resize includes assigning the same size: pixels are a new
      // transparent scene, and every derived piece of state resets (CAN-04).
      drain([
        () => state.reset(),
        () => path.reset(),
        () => lifecycle.reset(),
        () => raster.clearCache(),
      ]);
    },
    notifyLost(): void {
      if (disposed || device.status !== "active") return;
      device.lose();
      drain([() => lifecycle.lost()]);
      parts.onContextLost?.();
    },
    notifyRestored(): void {
      if (disposed || device.status !== "lost") return;
      // Rebuilds the programs and the transparent scene, advances the
      // generation, cancels stale submissions and schedules the clearing
      // present before any caller redraw joins the same checkpoint.
      device.restore();
      drain([
        // Clip snapshots belong to the lost generation, including the ones
        // held by the save stack; a restored context starts with no clip.
        () => state.discardClips(),
        () => raster.clearCache(),
        () => lifecycle.restored(),
      ]);
      parts.onContextRestored?.();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      // Stop library listeners first so a late platform event cannot re-enter
      // a half-disposed session.
      if (eventTarget) {
        eventTarget.removeEventListener(CONTEXT_LOST, onLost);
        eventTarget.removeEventListener(CONTEXT_RESTORED, onRestored);
      }
      drain([
        () => lifecycle.disposed(),
        // Cancels the pending present and releases every owned GPU resource.
        () => device.dispose(),
        () => raster.dispose(),
      ]);
    },
  };

  if (eventTarget) {
    eventTarget.addEventListener(CONTEXT_LOST, onLost);
    eventTarget.addEventListener(CONTEXT_RESTORED, onRestored);
  }
  return session;
}
