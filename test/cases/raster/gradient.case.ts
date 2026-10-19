// Raster-module self-test (native-assisted): pins the issue #33 contract that
// linear gradients evaluate in the DRAW-TIME user space, never in a
// creation-time space. Every path below is constructed under identity while
// the draw-time transform differs, and each asset is compared byte-exact
// against the native render; a creation-time implementation diverges by over
// a thousand bytes per probe (PR #38 review).
import type { CaseAdapter, CaseDefinition } from "../../types/testing.js";
import { PathRecorder } from "../../../src/path/recorder.js";
import type { Paint } from "../../../src/internal/contracts.js";
import {
  IDENTITY,
  compareAsset,
  makeLab,
  makeState,
  referenceContext,
} from "./helpers.js";

const RAMP: Paint = {
  kind: "linear-gradient",
  id: 31,
  version: 1,
  from: [0, 0],
  to: [40, 0],
  stops: [
    { offset: 0, color: [1, 0, 0, 1] },
    { offset: 1, color: [0, 0, 1, 1] },
  ],
};

function nativeRamp(ctx: CanvasRenderingContext2D): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, 0, 40, 0);
  gradient.addColorStop(0, "#ff0000");
  gradient.addColorStop(1, "#0000ff");
  return gradient;
}

function triangle(recorder: PathRecorder): void {
  recorder.begin();
  recorder.moveTo(10, 10, IDENTITY);
  recorder.lineTo(70, 10, IDENTITY);
  recorder.lineTo(40, 50, IDENTITY);
  recorder.closePath(IDENTITY);
}

function traceTriangle(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(10, 10);
  ctx.lineTo(70, 10);
  ctx.lineTo(40, 50);
  ctx.closePath();
}

function run(a: CaseAdapter): void {
  const lab = makeLab();
  const recorder = new PathRecorder();
  triangle(recorder);
  const snapshot = recorder.snapshot();

  // Construction transform (identity) differs from the draw-time transform:
  // the geometry stays at the construction position while the ramp follows
  // the draw-time space, so it starts at device (10,7).
  const fillReference = referenceContext();
  traceTriangle(fillReference);
  fillReference.setTransform(1, 0, 0, 1, 10, 7);
  fillReference.fillStyle = nativeRamp(fillReference);
  fillReference.fill();
  const fill = lab.rasterizer.path(
    snapshot,
    makeState({ transform: [1, 0, 0, 1, 10, 7], fill: RAMP }),
    "fill",
  );
  compareAsset(a, fillReference, fill, "gradient-fill-draw-transform");
  fill.release();

  // Same construction/draw-time split for stroke.
  const strokeReference = referenceContext();
  traceTriangle(strokeReference);
  strokeReference.lineWidth = 4;
  strokeReference.lineJoin = "round";
  strokeReference.setTransform(1, 0, 0, 1, 10, 7);
  strokeReference.strokeStyle = nativeRamp(strokeReference);
  strokeReference.stroke();
  const stroke = lab.rasterizer.path(
    snapshot,
    makeState({
      transform: [1, 0, 0, 1, 10, 7],
      stroke: RAMP,
      lineWidth: 4,
      lineJoin: "round",
    }),
    "stroke",
  );
  compareAsset(a, strokeReference, stroke, "gradient-stroke-draw-transform");
  stroke.release();

  // Rotate + scale: the ramp direction itself follows the draw-time space.
  // rotate(90°) then scale(2, 0.5) composes to [0, 2, -0.5, 0, 0, 0], so the
  // (0,0)->(40,0) user-space ramp runs vertically in device space.
  const rotatedReference = referenceContext();
  traceTriangle(rotatedReference);
  rotatedReference.rotate(Math.PI / 2);
  rotatedReference.scale(2, 0.5);
  rotatedReference.fillStyle = nativeRamp(rotatedReference);
  rotatedReference.fill();
  const rotated = lab.rasterizer.path(
    snapshot,
    makeState({ transform: [0, 2, -0.5, 0, 0, 0], fill: RAMP }),
    "fill",
  );
  compareAsset(a, rotatedReference, rotated, "gradient-fill-rotate-scale");
  rotated.release();
  lab.rasterizer.dispose();
}

export const cases: CaseDefinition[] = [
  {
    id: "raster.gradient.draw-time-space",
    requirements: ["REN-01"],
    kind: "semantic",
    width: 200,
    height: 200,
    seed: 1,
    fonts: [],
    run,
  },
];
