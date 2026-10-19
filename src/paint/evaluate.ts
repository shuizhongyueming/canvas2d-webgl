import type { Color, Paint } from "../internal/contracts.js";

type LinearGradientPaintSnapshot = Extract<Paint, { kind: "linear-gradient" }>;
type GradientStop = LinearGradientPaintSnapshot["stops"][number];

function lerpPremultiplied(from: Color, to: Color, t: number): Color {
  const a = from[3] + (to[3] - from[3]) * t;
  if (a === 0) return [0, 0, 0, 0];
  const channels: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const premultiplied =
      from[i]! * from[3] + (to[i]! * to[3] - from[i]! * from[3]) * t;
    channels.push(Math.min(1, Math.max(0, premultiplied / a)));
  }
  return [channels[0]!, channels[1]!, channels[2]!, a];
}

/**
 * Reference stop interpolation in premultiplied sRGB (result is straight).
 * Stops are sorted by offset with stable ties. At a duplicated offset the
 * last stop wins exactly at the point while the first stop of the group is
 * approached from the left; beyond the edge stops the edge colors extend
 * (pad): left of the group the FIRST stop paints, even at a duplicated
 * leading offset (Chromium probe, issue #15). Returns null when there is
 * nothing to paint (no stops).
 */
export function interpolateStops(
  stops: readonly GradientStop[],
  offset: number,
): Color | null {
  if (stops.length === 0) return null;
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  if (offset < first.offset) return first.color;
  if (offset > last.offset) return last.color;
  let index = 0;
  while (index + 1 < stops.length && stops[index + 1]!.offset <= offset) {
    index += 1;
  }
  const a = stops[index]!;
  if (a.offset === offset) return a.color;
  const b = stops[index + 1]!;
  return lerpPremultiplied(
    a.color,
    b.color,
    (offset - a.offset) / (b.offset - a.offset),
  );
}

/**
 * Evaluate a linear gradient at a USER-SPACE point (the space of the from/to
 * endpoints). Returns null when the gradient paints nothing: zero stops or a
 * zero-length gradient line (native paints nothing for degenerate lines).
 *
 * Native semantics (Chromium probes, issue #15): endpoints are interpreted in
 * the user space in effect AT DRAW TIME. Consumers must map device-space
 * fragments through the inverse of DrawState.transform — not through the
 * Paint.transform field, whose creation-time meaning is under contract review.
 */
export function linearGradientColorAt(
  paint: LinearGradientPaintSnapshot,
  userX: number,
  userY: number,
): Color | null {
  const dx = paint.to[0] - paint.from[0];
  const dy = paint.to[1] - paint.from[1];
  if (dx === 0 && dy === 0) return null;
  const t =
    ((userX - paint.from[0]) * dx + (userY - paint.from[1]) * dy) /
    (dx * dx + dy * dy);
  return interpolateStops(paint.stops, t);
}
