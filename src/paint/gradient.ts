import type { CompatGradient } from "../api.js";
import type { Color, Matrix, Paint, PaintRef } from "../internal/contracts.js";
import { ERROR_CODES, createCompatError } from "../contracts/errors.js";
import { classifyColorValue, parseSupportedColor } from "./color.js";
import { nativeException, webidlDouble, webidlString } from "./native-error.js";

const registry = new WeakSet<object>();
export function isCompatGradient(value: unknown): value is CompatGradient {
  return typeof value === "object" && value !== null && registry.has(value);
}

interface StopRecord {
  readonly offset: number;
  readonly color: Color;
  readonly order: number;
}

/**
 * Live linear-gradient style. Object identity is stable: assigning the same
 * gradient to fill/stroke or across save/restore keeps this reference, so
 * later addColorStop calls are observed by all referencing states. Each
 * mutation bumps `version`; Paint snapshots deep-freeze the stop list so
 * already-submitted draws never see later stops.
 *
 * Contract caveat (see issue #15): the frozen Paint contract documents the
 * gradient transform as creation-time, but Chromium probes show native
 * gradients evaluate in the DRAW-TIME user space, exactly like patterns. The
 * creation-time transform is still recorded here to satisfy the frozen type;
 * consumers must evaluate with the draw-time transform until the contract is
 * amended.
 */
export class LinearGradientPaint implements PaintRef {
  private stops: StopRecord[] = [];
  private stopOrder = 0;
  private currentVersion = 0;

  constructor(
    readonly id: number,
    private readonly from: readonly [number, number],
    private readonly to: readonly [number, number],
    private readonly creationTransform: Matrix,
  ) {
    registry.add(this);
  }

  get version(): number {
    return this.currentVersion;
  }

  get publicValue(): CompatGradient {
    return this as unknown as CompatGradient;
  }

  addColorStop(offset?: unknown, color?: unknown): void {
    const arity = arguments.length;
    if (arity < 2) {
      throw new TypeError(
        `Failed to execute 'addColorStop' on 'CanvasGradient': 2 arguments required, but only ${arity} present.`,
      );
    }
    const value = webidlDouble(offset);
    if (!Number.isFinite(value)) {
      throw new TypeError(
        "Failed to execute 'addColorStop' on 'CanvasGradient': The provided double value is non-finite.",
      );
    }
    if (value < 0 || value > 1) {
      throw nativeException(
        "IndexSizeError",
        1,
        `Failed to execute 'addColorStop' on 'CanvasGradient': The provided value (${value}) is outside the range (0.0, 1.0).`,
      );
    }
    const text = webidlString(color);
    const parsed = parseSupportedColor(text);
    if (parsed === null) {
      if (classifyColorValue(text) === "unsupported") {
        throw createCompatError(
          ERROR_CODES.UNSUPPORTED_API,
          `addColorStop: color outside the supported set: ${text}`,
        );
      }
      throw nativeException(
        "SyntaxError",
        12,
        `Failed to execute 'addColorStop' on 'CanvasGradient': The value provided ('${text}') could not be parsed as a color.`,
      );
    }
    this.stops.push({
      offset: value,
      color: parsed.color,
      order: this.stopOrder,
    });
    this.stopOrder += 1;
    this.currentVersion += 1;
  }

  snapshot(): Paint {
    const stops = [...this.stops]
      .sort((a, b) => a.offset - b.offset || a.order - b.order)
      .map((stop) => Object.freeze({ offset: stop.offset, color: stop.color }));
    return Object.freeze({
      kind: "linear-gradient",
      id: this.id,
      version: this.currentVersion,
      transform: Object.freeze([...this.creationTransform]) as Matrix,
      from: Object.freeze([...this.from]) as readonly [number, number],
      to: Object.freeze([...this.to]) as readonly [number, number],
      stops: Object.freeze(stops),
    }) as Paint;
  }
}
