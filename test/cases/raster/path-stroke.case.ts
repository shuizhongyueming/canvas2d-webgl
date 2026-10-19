import type { CaseAdapter, CaseDefinition } from "../../types/testing.js";
import { PathRecorder } from "../../../src/path/recorder.js";
import {
  IDENTITY,
  compareAsset,
  makeLab,
  makeState,
  referenceContext,
} from "./helpers.js";

function run(a: CaseAdapter): void {
  const lab = makeLab();

  // Geometry is baked at construction time; the line width follows the
  // stroke-time transform. Construct under translate(30,40), stroke under
  // scale(2) with a wide round join.
  const refA = referenceContext();
  refA.strokeStyle = "rgba(26,64,191,1)";
  refA.save();
  refA.translate(30, 40);
  refA.beginPath();
  refA.moveTo(0, 0);
  refA.lineTo(60, 0);
  refA.lineTo(60, 60);
  refA.restore();
  refA.save();
  refA.scale(2, 2);
  refA.lineWidth = 5;
  refA.lineJoin = "round";
  refA.stroke();
  refA.restore();

  const recorder = new PathRecorder();
  const shifted = [1, 0, 0, 1, 30, 40] as const;
  recorder.moveTo(0, 0, shifted);
  recorder.lineTo(60, 0, shifted);
  recorder.lineTo(60, 60, shifted);
  const strokeA = lab.rasterizer.path(
    recorder.snapshot(),
    makeState({
      transform: [2, 0, 0, 2, 0, 0],
      lineWidth: 5,
      lineJoin: "round",
      stroke: { kind: "solid", color: [0.1, 0.25, 0.75, 1] },
    }),
    "stroke",
  );
  compareAsset(a, refA, strokeA, "stroke-transform-split");
  strokeA.release();

  // A sharp miter join reaches far beyond the segment endpoints; the asset
  // margin must never clip it.
  const refB = referenceContext();
  refB.strokeStyle = "rgba(26,64,191,1)";
  refB.lineWidth = 9;
  refB.lineJoin = "miter";
  refB.beginPath();
  refB.moveTo(20, 150);
  refB.lineTo(100, 148);
  refB.lineTo(22, 146);
  refB.stroke();

  recorder.begin();
  recorder.moveTo(20, 150, IDENTITY);
  recorder.lineTo(100, 148, IDENTITY);
  recorder.lineTo(22, 146, IDENTITY);
  const strokeB = lab.rasterizer.path(
    recorder.snapshot(),
    makeState({ lineWidth: 9, lineJoin: "miter" }),
    "stroke",
  );
  compareAsset(a, refB, strokeB, "stroke-miter-reach");
  strokeB.release();

  // Round vs butt caps, including zero-length subpaths (native draws nothing).
  recorder.begin();
  recorder.moveTo(30, 30, IDENTITY);
  recorder.lineTo(90, 30, IDENTITY);
  recorder.moveTo(140, 30, IDENTITY);
  recorder.lineTo(140, 30, IDENTITY);
  const capRound = lab.rasterizer.path(
    recorder.snapshot(),
    makeState({ lineWidth: 7, lineCap: "round" }),
    "stroke",
  );
  const refCRound = referenceContext();
  refCRound.strokeStyle = "rgba(26,64,191,1)";
  refCRound.lineWidth = 7;
  refCRound.lineCap = "round";
  refCRound.beginPath();
  refCRound.moveTo(30, 30);
  refCRound.lineTo(90, 30);
  refCRound.moveTo(140, 30);
  refCRound.lineTo(140, 30);
  refCRound.stroke();
  compareAsset(a, refCRound, capRound, "stroke-round-cap");
  capRound.release();

  recorder.begin();
  recorder.moveTo(30, 60, IDENTITY);
  recorder.lineTo(90, 60, IDENTITY);
  recorder.moveTo(140, 60, IDENTITY);
  recorder.lineTo(140, 60, IDENTITY);
  const capButt = lab.rasterizer.path(
    recorder.snapshot(),
    makeState({ lineWidth: 7, lineCap: "butt" }),
    "stroke",
  );
  const refCButt = referenceContext();
  refCButt.strokeStyle = "rgba(26,64,191,1)";
  refCButt.lineWidth = 7;
  refCButt.lineCap = "butt";
  refCButt.beginPath();
  refCButt.moveTo(30, 60);
  refCButt.lineTo(90, 60);
  refCButt.moveTo(140, 60);
  refCButt.lineTo(140, 60);
  refCButt.stroke();
  compareAsset(a, refCButt, capButt, "stroke-butt-cap");
  capButt.release();
  lab.rasterizer.dispose();
}

export const cases: CaseDefinition[] = [
  {
    id: "raster.path-stroke.geometry",
    requirements: ["context.stroke", "context.lineWidth", "REN-01"],
    kind: "semantic",
    width: 64,
    height: 64,
    seed: 1,
    fonts: [],
    run,
  },
];
