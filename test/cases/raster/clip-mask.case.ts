// Raster-module self-test (native-assisted): drives src/raster directly with its
// own native canvases, not the compat context. GPU clip consumption belongs
// to the clip feature ticket (#21); these cases stay module regressions on
// both sides.
import type { CaseAdapter, CaseDefinition } from "../../types/testing.js";
import { PathRecorder } from "../../../src/path/recorder.js";
import {
  IDENTITY,
  SCENE,
  compareAsset,
  makeLab,
  referenceContext,
  sourcePixels,
} from "./helpers.js";

function buildPath(recorder: PathRecorder): void {
  recorder.rect(20, 20, 100, 100, IDENTITY);
  recorder.rect(50, 50, 60, 60, IDENTITY);
  recorder.moveTo(180, 60, IDENTITY);
  recorder.arc(160, 60, 20, 0, Math.PI * 2, false, IDENTITY);
}

function buildNative(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.rect(20, 20, 100, 100);
  ctx.rect(50, 50, 60, 60);
  ctx.moveTo(180, 60);
  ctx.arc(160, 60, 20, 0, Math.PI * 2);
}

function run(a: CaseAdapter): void {
  const lab = makeLab();
  const bounds = { x: 0, y: 0, width: SCENE.width, height: SCENE.height };

  // The asset is effective native clip coverage, sampled by drawing white
  // through the requested clip. fill(rule) can use different edge coverage.
  for (const rule of ["nonzero", "evenodd"] as const) {
    const reference = referenceContext();
    buildNative(reference);
    reference.fillStyle = "#ffffff";
    reference.clip(rule);
    reference.fillRect(0, 0, SCENE.width, SCENE.height);

    const recorder = new PathRecorder();
    recorder.begin();
    buildPath(recorder);
    const mask = lab.rasterizer.clip(recorder.snapshot(), rule, bounds);
    a.assert(
      mask.pixelWidth === SCENE.width && mask.pixelHeight === SCENE.height,
      `${rule} mask covers the requested bounds`,
    );
    compareAsset(a, reference, mask, `clip:${rule}`);

    const pixels = sourcePixels(mask);
    const alphaAt = (x: number, y: number) =>
      pixels[(y * SCENE.width + x) * 4 + 3];
    if (rule === "evenodd") {
      a.assert(alphaAt(60, 60) === 0, "evenodd mask cuts the inner hole");
      a.assert(alphaAt(30, 30) === 255, "evenodd mask keeps the outer ring");
    } else {
      a.assert(alphaAt(60, 60) === 255, "nonzero mask keeps the inner overlap");
    }
    mask.release();
  }
  lab.rasterizer.dispose();
}

export const cases: CaseDefinition[] = [
  {
    id: "raster.clip.mask",
    requirements: ["REN-01"],
    kind: "semantic",
    width: 200,
    height: 200,
    seed: 1,
    fonts: [],
    run,
  },
  {
    id: "raster.clip.pixel-upload",
    requirements: ["REN-01"],
    kind: "semantic",
    width: 200,
    height: 200,
    seed: 1,
    fonts: [],
    run(a) {
      const lab = makeLab();
      const recorder = new PathRecorder();
      recorder.begin();
      recorder.rect(20.5, 20, 100, 100, IDENTITY);
      recorder.rect(50, 50, 60, 60, IDENTITY);
      recorder.moveTo(180, 60, IDENTITY);
      recorder.arc(160, 60, 20, 0, Math.PI * 2, false, IDENTITY);
      const reference = referenceContext();
      reference.beginPath();
      reference.rect(20.5, 20, 100, 100);
      reference.rect(50, 50, 60, 60);
      reference.moveTo(180, 60);
      reference.arc(160, 60, 20, 0, Math.PI * 2);
      reference.fillStyle = "#ffffff";
      reference.clip("evenodd");
      reference.fillRect(0, 0, SCENE.width, SCENE.height);
      const mask = lab.rasterizer.clip(recorder.snapshot(), "evenodd", {
        x: 0,
        y: 0,
        width: SCENE.width,
        height: SCENE.height,
      });
      a.assert(
        lab.created.length === 1,
        "clip captures a pixel buffer without eagerly allocating a bitmap",
      );
      const recorder2 = new PathRecorder();
      recorder2.rect(0, 0, 10, 10, IDENTITY);
      const next = lab.rasterizer.clip(recorder2.snapshot(), "nonzero", {
        x: 0,
        y: 0,
        width: SCENE.width,
        height: SCENE.height,
      });
      a.assert(
        mask.canvas !== next.canvas,
        "later clip drawing cannot overwrite the first mask",
      );
      next.release();
      const pixels = sourcePixels(mask);
      a.assert(
        mask.imageData !== undefined,
        "clip retains captured pixels after the shared stage is reused",
      );
      compareAsset(a, reference, mask, "clip:pixel-upload");
      const outside = pixels[(10 * SCENE.width + 10) * 4 + 3];
      const ring = pixels[(30 * SCENE.width + 30) * 4 + 3];
      const hole = pixels[(60 * SCENE.width + 60) * 4 + 3];
      a.assert(
        outside === 0 && ring === 255 && hole === 0,
        "direct native upload preserves evenodd coverage",
      );
      const edge = pixels[(30 * SCENE.width + 20) * 4 + 3]!;
      a.assert(
        edge > 0 && edge < 255,
        "direct native upload preserves soft clip edges",
      );
      mask.release();
      lab.rasterizer.dispose();
    },
  },
];
