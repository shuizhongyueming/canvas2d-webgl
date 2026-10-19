import test from "node:test";
import assert from "node:assert/strict";
import { LinearGradientPaint } from "../../../dist/paint/gradient.js";
import {
  interpolateStops,
  linearGradientColorAt,
} from "../../../dist/paint/evaluate.js";

const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);
const color = (hex, alpha = 255) =>
  [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
    alpha / 255,
  ];
const stop = (offset, hex, alpha) => ({ offset, color: color(hex, alpha) });
const gradient = (stops, from = [0, 0], to = [100, 0]) => ({
  kind: "linear-gradient",
  id: 1,
  version: 1,
  transform: IDENTITY,
  from,
  to,
  stops,
});
const byte = (channel) => Math.round(channel * 255);

test("interpolateStops pads and interpolates in premultiplied space", () => {
  assert.equal(interpolateStops([], 0.5), null);
  assert.deepEqual(interpolateStops([stop(0.5, "#336699")], 0.1), color("#336699"));
  const stops = [stop(0, "#ff0000"), stop(1, "#0000ff")];
  assert.deepEqual(interpolateStops(stops, -1), color("#ff0000"));
  assert.deepEqual(interpolateStops(stops, 2), color("#0000ff"));
  const mid = interpolateStops(stops, 0.5).map(byte);
  assert.deepEqual(mid, [128, 0, 128, 255]);
  // Premultiplied interpolation: transparent red to opaque blue stays pure
  // blue at the midpoint (straight-space interpolation would turn purple).
  const fade = [stop(0, "#ff0000", 0), stop(1, "#0000ff")];
  const half = interpolateStops(fade, 0.5);
  assert.deepEqual(half.map(byte), [0, 0, 255, 128]);
});

test("duplicate offsets: last stop wins at the point, first from the left", () => {
  const stops = [
    stop(0, "#ff0000"),
    stop(0.5, "#00ff00"),
    stop(0.5, "#0000ff"),
    stop(1, "#ffffff"),
  ];
  assert.deepEqual(interpolateStops(stops, 0.5), color("#0000ff"));
  const left = interpolateStops(stops, 0.499).map(byte);
  assert.ok(left[1] > 200 && left[2] < 10, `from the left: ${left}`);
  assert.deepEqual(interpolateStops(stops, 0.5001).map(byte), [0, 0, 255, 255]);
  assert.deepEqual(interpolateStops(stops, 0.75).map(byte), [128, 128, 255, 255]);
});

test("duplicated edge stops: point takes the last stop, pad takes the edge stop", () => {
  // Chromium probe (PR #34 review): [0:red, 0:blue, 1:green] paints blue at
  // t=0 exactly, red in the left pad, and blue->green right of the group.
  const dupFirst = [stop(0, "#ff0000"), stop(0, "#0000ff"), stop(1, "#00ff00")];
  assert.deepEqual(interpolateStops(dupFirst, 0), color("#0000ff"), "t=0");
  assert.deepEqual(interpolateStops(dupFirst, -0.5), color("#ff0000"), "left pad");
  const rightOfGroup = interpolateStops(dupFirst, 0.001).map(byte);
  assert.ok(
    rightOfGroup[2] > 250 && rightOfGroup[1] < 5,
    `right of the group starts from blue: ${rightOfGroup}`,
  );
  // [0:red, 1:green, 1:blue] paints blue at t=1 and in the right pad.
  const dupLast = [stop(0, "#ff0000"), stop(1, "#00ff00"), stop(1, "#0000ff")];
  assert.deepEqual(interpolateStops(dupLast, 1), color("#0000ff"), "t=1");
  assert.deepEqual(interpolateStops(dupLast, 1.5), color("#0000ff"), "right pad");
  const leftOfGroup = interpolateStops(dupLast, 0.999).map(byte);
  assert.ok(
    leftOfGroup[1] > 250 && leftOfGroup[2] < 5,
    `left of the group approaches green: ${leftOfGroup}`,
  );
});

test("linearGradientColorAt follows native drawing rules", () => {
  const ramp = gradient([stop(0, "#ff0000"), stop(1, "#0000ff")]);
  assert.deepEqual(linearGradientColorAt(ramp, 0, 5), color("#ff0000"));
  assert.deepEqual(linearGradientColorAt(ramp, 100, 5), color("#0000ff"));
  assert.deepEqual(linearGradientColorAt(ramp, 50, 99).map(byte), [128, 0, 128, 255]);
  // Zero-length gradient lines paint nothing, even with stops.
  const degenerate = gradient([stop(0, "#ff0000"), stop(1, "#0000ff")], [5, 5], [5, 5]);
  assert.equal(linearGradientColorAt(degenerate, 5, 5), null);
  // No stops paint nothing.
  assert.equal(linearGradientColorAt(gradient([]), 10, 10), null);
  // A single stop fills the whole plane.
  assert.deepEqual(
    linearGradientColorAt(gradient([stop(0.5, "#336699")]), 10, 10),
    color("#336699"),
  );
});

test("class snapshots feed the evaluator without aliasing", () => {
  const g = new LinearGradientPaint(1, [0, 0], [10, 0], IDENTITY);
  g.addColorStop(0, "#ff0000");
  const paint = g.snapshot();
  assert.deepEqual(linearGradientColorAt(paint, 2, 0), color("#ff0000"));
  g.addColorStop(1, "#0000ff");
  assert.equal(linearGradientColorAt(g.snapshot(), 10, 0)[2], 1);
  assert.equal(
    linearGradientColorAt(paint, 10, 0)[2],
    0,
    "earlier snapshot is unaffected",
  );
});
