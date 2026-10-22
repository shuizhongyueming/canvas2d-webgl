import type { Color, Paint, PaintRef } from "../internal/contracts.js";

/** Immutable solid fill/stroke style; version never changes. */
export class SolidPaint implements PaintRef {
  readonly version = 0;

  constructor(
    readonly id: number,
    readonly color: Color,
    readonly canonical: string,
  ) {}

  get publicValue(): string {
    return this.canonical;
  }

  snapshot(): Paint {
    return Object.freeze({ kind: "solid", color: this.color }) as Paint;
  }
}

/** Initial fill/stroke value per the support matrix default "#000000". */
export function defaultStylePaint(id: number): SolidPaint {
  return new SolidPaint(id, Object.freeze([0, 0, 0, 1]) as Color, "#000000");
}

/**
 * Paint ids reserved for the default fill/stroke styles. Every allocated id
 * sits above this range, so a default style can never be mistaken for a
 * gradient or pattern key.
 */
export const DEFAULT_STYLE_IDS = Object.freeze({ fill: 1, stroke: 2 });
