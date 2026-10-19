import type { Matrix } from "../internal/contracts.js";

/** Canvas column-vector transform [a,b,c,d,e,f], device pixels, top-left origin. */
export const IDENTITY: Matrix = Object.freeze([1, 0, 0, 1, 0, 0]) as Matrix;

/** Post-multiply by a translation, matching the native CTM update. */
export function translateBy(m: Matrix, x: number, y: number): Matrix {
  return [
    m[0],
    m[1],
    m[2],
    m[3],
    m[0] * x + m[2] * y + m[4],
    m[1] * x + m[3] * y + m[5],
  ] as Matrix;
}

/** Post-multiply by a scale; negative factors mirror, zero degenerates (both native-legal). */
export function scaleBy(m: Matrix, x: number, y: number): Matrix {
  return [m[0] * x, m[1] * x, m[2] * y, m[3] * y, m[4], m[5]] as Matrix;
}

/** Post-multiply by a rotation of `angle` radians (clockwise on screen, y-down). */
export function rotateBy(m: Matrix, angle: number): Matrix {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    m[0] * cos + m[2] * sin,
    m[1] * cos + m[3] * sin,
    m[2] * cos - m[0] * sin,
    m[3] * cos - m[1] * sin,
    m[4],
    m[5],
  ] as Matrix;
}
