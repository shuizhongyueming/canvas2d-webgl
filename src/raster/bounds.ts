import type { Bounds, PathSnapshot } from "../internal/contracts.js";
import { applyPoint } from "./matrix.js";

class BoundsWalker {
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;
  #current: readonly [number, number] | null = null;
  #subpathStart: readonly [number, number] | null = null;

  include(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < this.minX) this.minX = x;
    if (y < this.minY) this.minY = y;
    if (x > this.maxX) this.maxX = x;
    if (y > this.maxY) this.maxY = y;
  }

  moveTo(x: number, y: number): void {
    this.#current = [x, y];
    this.#subpathStart = this.#current;
    this.include(x, y);
  }

  lineTo(x: number, y: number): void {
    if (!this.#current) return this.moveTo(x, y);
    this.#current = [x, y];
    this.include(x, y);
  }

  closePath(): void {
    this.#current = this.#subpathStart;
  }

  result(): Bounds | null {
    if (this.minX > this.maxX || this.minY > this.maxY) return null;
    return {
      x: this.minX,
      y: this.minY,
      width: this.maxX - this.minX,
      height: this.maxY - this.minY,
    };
  }
}

/**
 * Conservative device-space hull of the recorded geometry. Curves and arcs are
 * covered by their control/ellipse hulls, so the result always contains every
 * painted pixel; stroke margin is the caller's concern.
 */
export function pathGeometryBounds(path: PathSnapshot): Bounds | null {
  const walker = new BoundsWalker();
  for (const command of path.commands) {
    const m = command.transform;
    const at = (x: number, y: number) => applyPoint(m, x, y);
    switch (command.op) {
      case "closePath":
        walker.closePath();
        break;
      case "moveTo": {
        const [x, y] = at(command.args[0], command.args[1]);
        walker.moveTo(x, y);
        break;
      }
      case "lineTo": {
        const [x, y] = at(command.args[0], command.args[1]);
        walker.lineTo(x, y);
        break;
      }
      case "rect": {
        const [x, y, w, h] = command.args;
        for (const [cx, cy] of [
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
        ] as const) {
          const [px, py] = at(cx, cy);
          walker.include(px, py);
        }
        const [sx, sy] = at(x, y);
        walker.moveTo(sx, sy);
        walker.include(sx, sy);
        break;
      }
      case "quadraticCurveTo": {
        const [cx, cy] = at(command.args[0], command.args[1]);
        walker.include(cx, cy);
        const [x, y] = at(command.args[2], command.args[3]);
        walker.lineTo(x, y);
        break;
      }
      case "arcTo": {
        const [x1, y1] = at(command.args[0], command.args[1]);
        walker.include(x1, y1);
        const [x2, y2] = at(command.args[2], command.args[3]);
        walker.include(x2, y2);
        // The tangent end point lies on the segment to (x2, y2); stay conservative.
        walker.lineTo(x2, y2);
        break;
      }
      case "arc": {
        const [x, y, radius] = command.args;
        for (const [cx, cy] of [
          [x - radius, y - radius],
          [x + radius, y - radius],
          [x + radius, y + radius],
          [x - radius, y + radius],
        ] as const) {
          const [px, py] = at(cx, cy);
          walker.include(px, py);
        }
        const [sx, sy] = at(x + radius, y);
        walker.lineTo(sx, sy);
        break;
      }
      case "ellipse": {
        const [x, y, radiusX, radiusY] = command.args;
        for (const [cx, cy] of [
          [x - radiusX, y - radiusY],
          [x + radiusX, y - radiusY],
          [x + radiusX, y + radiusY],
          [x - radiusX, y + radiusY],
        ] as const) {
          const [px, py] = at(cx, cy);
          walker.include(px, py);
        }
        const [sx, sy] = at(x + radiusX, y);
        walker.lineTo(sx, sy);
        break;
      }
    }
  }
  return walker.result();
}
