import type { NativeCanvas, TargetCanvas } from "../api.js";
import { createCompatError, ERROR_CODES } from "../contracts/errors.js";

/**
 * The injected or default native offscreen canvas factory. It exists for the
 * library's internal rasterization only; caller-created canvases are never
 * wrapped or intercepted (REN-02).
 */
export type OffscreenFactory = (width: number, height: number) => NativeCanvas;

function invalidFactory(detail: string): never {
  throw createCompatError(ERROR_CODES.INVALID_FACTORY, detail);
}

/**
 * Pick the offscreen factory for this creation. Mini-game platforms have no
 * `document`, so the factory is mandatory there; a present-but-unusable
 * factory option is a usage error, not a capability failure.
 */
export function resolveOffscreenFactory(
  injected: ((width: number, height: number) => NativeCanvas) | undefined,
): OffscreenFactory {
  if (injected !== undefined) {
    if (typeof injected !== "function")
      invalidFactory("createOffscreenCanvas must be a function");
    return injected;
  }
  if (typeof document !== "undefined")
    return (width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    };
  invalidFactory("createOffscreenCanvas is required on this platform");
}

function looksLikeCanvas(value: unknown): value is NativeCanvas {
  if (!value || typeof value !== "object") return false;
  const canvas = value as NativeCanvas;
  return (
    typeof canvas.getContext === "function" &&
    typeof canvas.width === "number" &&
    typeof canvas.height === "number"
  );
}

/**
 * Synchronously prove the factory returns legal, independent native canvases
 * before any GPU resource is allocated. Probe bitmaps are released here; the
 * factory itself stays owned by the caller contract and is reused later.
 */
export function validateOffscreenFactory(
  factory: OffscreenFactory,
  target: TargetCanvas,
): void {
  const probes: NativeCanvas[] = [];
  try {
    for (let probeIndex = 0; probeIndex < 2; probeIndex += 1) {
      let probe: unknown;
      try {
        probe = factory(4, 3);
      } catch (failure) {
        invalidFactory(
          `createOffscreenCanvas threw: ${
            failure instanceof Error ? failure.message : String(failure)
          }`,
        );
      }
      if (!looksLikeCanvas(probe))
        invalidFactory("createOffscreenCanvas returned an illegal canvas");
      if (probe === target || probes.includes(probe))
        invalidFactory(
          "createOffscreenCanvas must return an independent canvas per call",
        );
      if (probe.width !== 4 || probe.height !== 3)
        invalidFactory(
          "createOffscreenCanvas must honor the requested dimensions",
        );
      try {
        probe.width = 5;
      } catch {
        invalidFactory("offscreen canvas dimensions must be mutable");
      }
      if (probe.width !== 5)
        invalidFactory("offscreen canvas dimensions must be mutable");
      let context2d: unknown;
      try {
        context2d = probe.getContext("2d");
      } catch {
        invalidFactory("offscreen canvas getContext('2d') threw");
      }
      if (!context2d)
        throw createCompatError(
          ERROR_CODES.CAPABILITY,
          "native offscreen 2D context is unavailable",
        );
      probes.push(probe);
    }
  } finally {
    // Release probe bitmaps without touching the caller's target canvas.
    for (const probe of probes) {
      try {
        probe.width = 0;
        probe.height = 0;
      } catch {
        /* Probe cleanup never masks the validation outcome. */
      }
    }
  }
}
