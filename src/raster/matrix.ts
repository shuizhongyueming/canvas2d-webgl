import type { Bounds, Matrix } from "../internal/contracts.js";

export function applyPoint(
  m: Matrix,
  x: number,
  y: number,
): readonly [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Upper bound of the linear scale factor; exact for rotate/scale, generous for shear. */
export function scaleBound(m: Matrix): number {
  return Math.sqrt(m[0] ** 2 + m[1] ** 2 + m[2] ** 2 + m[3] ** 2);
}

export function invert(m: Matrix): Matrix | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(det) || det === 0) return null;
  const inv = 1 / det;
  return [
    m[3] * inv,
    -m[1] * inv,
    -m[2] * inv,
    m[0] * inv,
    (m[2] * m[5] - m[3] * m[4]) * inv,
    (m[1] * m[4] - m[0] * m[5]) * inv,
  ];
}

/** translate(-x, -y) applied after m: asset-space version of a device-space matrix. */
export function offsetMatrix(m: Matrix, x: number, y: number): Matrix {
  return [m[0], m[1], m[2], m[3], m[4] - x, m[5] - y];
}

/** Grow to whole pixels without moving the sampling phase, then clip to the scene. */
export function alignOutset(
  bounds: Bounds,
  margin: number,
  scene: Bounds,
): Bounds | null {
  const x0 = Math.max(Math.floor(bounds.x - margin), scene.x);
  const y0 = Math.max(Math.floor(bounds.y - margin), scene.y);
  const x1 = Math.min(Math.ceil(bounds.x + bounds.width + margin), scene.x + scene.width);
  const y1 = Math.min(Math.ceil(bounds.y + bounds.height + margin), scene.y + scene.height);
  if (!(x1 > x0 && y1 > y0)) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
