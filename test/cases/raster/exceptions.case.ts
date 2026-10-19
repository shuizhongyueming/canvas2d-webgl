// Raster-module self-test (native-assisted): drives src/raster directly with its
// own native canvases, not the compat context. Compat context coverage arrives
// with the path feature ticket (#19); these cases stay module regressions on
// both sides.
import type { CaseAdapter, CaseDefinition } from "../../types/testing.js";
import { PathRecorder } from "../../../src/path/recorder.js";
import { IDENTITY } from "./helpers.js";

interface CapturedError {
  name: string;
  code: number | undefined;
}

function capture(fn: () => void): CapturedError | null {
  try {
    fn();
    return null;
  } catch (error) {
    if (error instanceof DOMException)
      return { name: error.name, code: error.code };
    return { name: error instanceof Error ? error.name : "unknown", code: undefined };
  }
}

function run(a: CaseAdapter): void {
  const native = document.createElement("canvas");
  native.width = 32;
  native.height = 32;
  const ctx = native.getContext("2d");
  if (!ctx) throw new Error("native 2d context unavailable");
  const recorder = new PathRecorder();

  const attempts: readonly [string, () => void, () => void][] = [
    ["arc", () => ctx.arc(5, 5, -1, 0, 6.3), () => recorder.arc(5, 5, -1, 0, 6.3, false, IDENTITY)],
    ["arcTo", () => ctx.arcTo(1, 1, 2, 2, -3), () => recorder.arcTo(1, 1, 2, 2, -3, IDENTITY)],
    [
      "ellipse-major",
      () => ctx.ellipse(5, 5, -1, 2, 0, 0, 6.3),
      () => recorder.ellipse(5, 5, -1, 2, 0, 0, 6.3, false, IDENTITY),
    ],
    [
      "ellipse-minor",
      () => ctx.ellipse(5, 5, 1, -2, 0, 0, 6.3),
      () => recorder.ellipse(5, 5, 1, -2, 0, 0, 6.3, false, IDENTITY),
    ],
  ];
  for (const [label, nativeCall, recorderCall] of attempts) {
    const expected = capture(nativeCall);
    const actual = capture(recorderCall);
    a.observe(`${label}:native`, expected ? `${expected.name}:${expected.code}` : "none");
    a.assert(expected !== null, `${label}: native rejects a negative radius`);
    a.assert(actual !== null, `${label}: recorder rejects a negative radius`);
    a.assert(
      actual?.name === expected?.name && actual?.code === expected?.code,
      `${label}: recorder exception matches native name and code`,
    );
  }
  a.assert(recorder.snapshot().commands.length === 0, "rejected calls record nothing");

  const ignores: readonly [string, () => void, () => void][] = [
    ["arc-non-finite", () => ctx.arc(NaN, 5, -1, 0, 6.3), () => recorder.arc(NaN, 5, -1, 0, 6.3, false, IDENTITY)],
    ["arcTo-non-finite", () => ctx.arcTo(1, Infinity, 2, 2, -3), () => recorder.arcTo(1, Infinity, 2, 2, -3, IDENTITY)],
    ["ellipse-non-finite", () => ctx.ellipse(5, 5, Infinity, -2, 0, 0, 6.3), () => recorder.ellipse(5, 5, Infinity, -2, 0, 0, 6.3, false, IDENTITY)],
    ["moveTo-non-finite", () => ctx.moveTo(Infinity, 0), () => recorder.moveTo(Infinity, 0, IDENTITY)],
    ["lineTo-non-finite", () => ctx.lineTo(0, NaN), () => recorder.lineTo(0, NaN, IDENTITY)],
    ["rect-non-finite", () => ctx.rect(0, 0, NaN, 1), () => recorder.rect(0, 0, NaN, 1, IDENTITY)],
    ["quadratic-non-finite", () => ctx.quadraticCurveTo(1, 2, 3, Infinity), () => recorder.quadraticCurveTo(1, 2, 3, Infinity, IDENTITY)],
  ];
  for (const [label, nativeCall, recorderCall] of ignores) {
    const expected = capture(nativeCall);
    const actual = capture(recorderCall);
    a.assert(expected === null, `${label}: native silently ignores non-finite input`);
    a.assert(actual === null, `${label}: recorder silently ignores non-finite input`);
  }
  a.assert(
    recorder.snapshot().commands.length === 0,
    "ignored calls record nothing, including before the radius check",
  );

  // The current path is not part of save/restore state on either side.
  ctx.beginPath();
  ctx.moveTo(2, 2);
  ctx.lineTo(30, 2);
  ctx.save();
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.stroke();
  const alpha = ctx.getImageData(16, 2, 1, 1).data[3] ?? 0;
  a.assert(alpha > 0, "native path survives save/restore");
  const before = recorder.snapshot();
  recorder.moveTo(4, 4, IDENTITY);
  a.assert(before.commands.length === 0, "recorder snapshots are independent of later calls");
}

export const cases: CaseDefinition[] = [
  {
    id: "raster.exceptions.native-match",
    requirements: ["REN-01"],
    kind: "semantic",
    width: 200,
    height: 200,
    seed: 1,
    fonts: [],
    run,
  },
];
