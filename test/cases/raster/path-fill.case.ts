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
  const recorder = new PathRecorder();

  // Game-level reference: closed concave polygon, self-intersection, quadratic
  // curve, arcs, rotated ellipse, rect and arcTo, one section under translate.
  const reference = referenceContext();
  reference.fillStyle = "rgba(204,26,51,1)";
  reference.beginPath();
  reference.moveTo(20, 20);
  reference.lineTo(80, 20);
  reference.lineTo(50, 50);
  reference.lineTo(80, 80);
  reference.lineTo(20, 80);
  reference.closePath();
  reference.moveTo(110, 20);
  reference.lineTo(160, 70);
  reference.lineTo(160, 20);
  reference.lineTo(110, 70);
  reference.closePath();
  reference.moveTo(20, 115);
  reference.quadraticCurveTo(60, 60, 100, 115);
  reference.closePath();
  reference.moveTo(165, 125);
  reference.arc(140, 125, 25, 0, Math.PI * 1.5);
  reference.moveTo(185, 175);
  reference.arc(170, 175, 15, 0, Math.PI * 2);
  reference.ellipse(50, 170, 30, 12, 0.4, 0, Math.PI * 2);
  reference.rect(100, 100, 20, 15);
  reference.moveTo(120, 165);
  reference.lineTo(150, 165);
  reference.arcTo(185, 165, 185, 195, 12);
  reference.lineTo(185, 195);
  reference.save();
  reference.translate(7, 9);
  reference.moveTo(0, 140);
  reference.lineTo(25, 140);
  reference.lineTo(12, 155);
  reference.closePath();
  reference.restore();
  reference.fill();

  recorder.begin();
  recorder.moveTo(20, 20, IDENTITY);
  recorder.lineTo(80, 20, IDENTITY);
  recorder.lineTo(50, 50, IDENTITY);
  recorder.lineTo(80, 80, IDENTITY);
  recorder.lineTo(20, 80, IDENTITY);
  recorder.closePath(IDENTITY);
  recorder.moveTo(110, 20, IDENTITY);
  recorder.lineTo(160, 70, IDENTITY);
  recorder.lineTo(160, 20, IDENTITY);
  recorder.lineTo(110, 70, IDENTITY);
  recorder.closePath(IDENTITY);
  recorder.moveTo(20, 115, IDENTITY);
  recorder.quadraticCurveTo(60, 60, 100, 115, IDENTITY);
  recorder.closePath(IDENTITY);
  recorder.moveTo(165, 125, IDENTITY);
  recorder.arc(140, 125, 25, 0, Math.PI * 1.5, false, IDENTITY);
  recorder.moveTo(185, 175, IDENTITY);
  recorder.arc(170, 175, 15, 0, Math.PI * 2, false, IDENTITY);
  recorder.ellipse(50, 170, 30, 12, 0.4, 0, Math.PI * 2, false, IDENTITY);
  recorder.rect(100, 100, 20, 15, IDENTITY);
  recorder.moveTo(120, 165, IDENTITY);
  recorder.lineTo(150, 165, IDENTITY);
  recorder.arcTo(185, 165, 185, 195, 12, IDENTITY);
  recorder.lineTo(185, 195, IDENTITY);
  const moved = [1, 0, 0, 1, 7, 9] as const;
  recorder.moveTo(0, 140, moved);
  recorder.lineTo(25, 140, moved);
  recorder.lineTo(12, 155, moved);
  recorder.closePath(moved);

  const source = lab.rasterizer.path(recorder.snapshot(), makeState(), "fill");
  compareAsset(a, reference, source, "mixed-fill");
  a.assert(source.pixelWidth === source.bounds.width, "fill asset is 1:1 with device bounds");
  source.release();

  // Degenerate inputs: an empty path and a point-only path rasterize to
  // transparent assets, exactly like the native no-op renders.
  const emptyReference = referenceContext();
  emptyReference.fillStyle = "rgba(204,26,51,1)";
  emptyReference.beginPath();
  emptyReference.fill();
  recorder.begin();
  const empty = lab.rasterizer.path(recorder.snapshot(), makeState(), "fill");
  a.assert(empty.bounds.width === 0 && empty.bounds.height === 0, "empty path gives a degenerate asset");
  compareAsset(a, emptyReference, empty, "empty-fill");
  empty.release();

  const pointReference = referenceContext();
  pointReference.beginPath();
  pointReference.moveTo(30, 30);
  pointReference.closePath();
  pointReference.fill();
  recorder.begin();
  recorder.moveTo(30, 30, IDENTITY);
  recorder.closePath(IDENTITY);
  const point = lab.rasterizer.path(recorder.snapshot(), makeState(), "fill");
  compareAsset(a, pointReference, point, "point-fill");
  point.release();

  // Non-finite arguments are dropped at construction, matching native.
  const nanReference = referenceContext();
  nanReference.fillStyle = "rgba(204,26,51,1)";
  nanReference.beginPath();
  nanReference.moveTo(10, 10);
  nanReference.lineTo(NaN, 5);
  nanReference.lineTo(60, 10);
  nanReference.lineTo(35, 40);
  nanReference.closePath();
  nanReference.fill();
  recorder.begin();
  recorder.moveTo(10, 10, IDENTITY);
  recorder.lineTo(NaN, 5, IDENTITY);
  recorder.lineTo(60, 10, IDENTITY);
  recorder.lineTo(35, 40, IDENTITY);
  recorder.closePath(IDENTITY);
  const partial = lab.rasterizer.path(recorder.snapshot(), makeState(), "fill");
  compareAsset(a, nanReference, partial, "non-finite-fill");
  partial.release();
  lab.rasterizer.dispose();
}

export const cases: CaseDefinition[] = [
  {
    id: "raster.path-fill.geometry",
    requirements: ["context.fill", "context.rect", "REN-01"],
    kind: "semantic",
    width: 64,
    height: 64,
    seed: 1,
    fonts: [],
    run,
  },
];
