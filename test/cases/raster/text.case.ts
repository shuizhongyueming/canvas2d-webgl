// Raster-module self-test (native-assisted): drives src/raster directly with its
// own native canvases, not the compat context. Compat context coverage arrives
// with the text feature ticket; these cases stay module regressions on
// both sides.
import type { CaseAdapter, CaseDefinition } from "../../types/testing.js";
import {
  compareAsset,
  makeLab,
  makeState,
  referenceContext,
} from "./helpers.js";
import type { DrawState } from "../../../src/internal/contracts.js";

const ALIGNS = ["start", "left", "center", "right"] as const;
const BASELINES = ["alphabetic", "top", "middle", "bottom"] as const;

function run(a: CaseAdapter): void {
  const lab = makeLab();
  const font = "24px sans-serif";

  // measureText delegates to the same native metrics the reference uses.
  for (const align of ALIGNS) {
    const state = makeState({ font, textAlign: align });
    const reference = referenceContext();
    reference.font = font;
    reference.textAlign = align;
    const expected = reference.measureText("Canvas-2d").width;
    const actual = lab.rasterizer.measureWidth("Canvas-2d", state);
    a.observe(`measure:${align}`, actual);
    a.assert(actual === expected, `measureText width matches native for ${align}`);
  }

  for (const align of ALIGNS) {
    for (const baseline of BASELINES) {
      const state: DrawState = makeState({
        font,
        textAlign: align,
        textBaseline: baseline,
      });
      const reference = referenceContext();
      reference.font = font;
      reference.textAlign = align;
      reference.textBaseline = baseline;
      reference.fillStyle = "rgba(204,26,51,1)";
      reference.fillText("Ag_画", 100, 100);
      const source = lab.rasterizer.text("Ag_画", 100, 100, state, "fill");
      compareAsset(a, reference, source, `fillText:${align}/${baseline}`);
      source.release();
    }
  }

  const strokeState = makeState({
    font,
    textAlign: "center",
    textBaseline: "middle",
    lineWidth: 3,
    lineJoin: "round",
  });
  const strokeReference = referenceContext();
  strokeReference.font = font;
  strokeReference.textAlign = "center";
  strokeReference.textBaseline = "middle";
  strokeReference.lineWidth = 3;
  strokeReference.lineJoin = "round";
  strokeReference.strokeStyle = "rgba(26,64,191,1)";
  strokeReference.strokeText("Outline", 100, 100);
  const stroked = lab.rasterizer.text("Outline", 100, 100, strokeState, "stroke");
  compareAsset(a, strokeReference, stroked, "strokeText");
  stroked.release();

  // Text honors the draw-time transform for both placement and scale.
  const rotated = makeState({ font, transform: [0, 1, -1, 0, 150, 20] });
  const rotatedReference = referenceContext();
  rotatedReference.setTransform(0, 1, -1, 0, 150, 20);
  rotatedReference.font = font;
  rotatedReference.fillStyle = "rgba(204,26,51,1)";
  rotatedReference.fillText("Rot", 0, 0);
  const rotatedSource = lab.rasterizer.text("Rot", 0, 0, rotated, "fill");
  compareAsset(a, rotatedReference, rotatedSource, "fillText:rotated");
  rotatedSource.release();

  // Cache keys include x/y: the same text at two positions must miss, and a
  // repeated position must hit.
  const positionState = makeState({ font });
  const atA = lab.rasterizer.text("Pos", 40, 60, positionState, "fill");
  const atB = lab.rasterizer.text("Pos", 120, 60, positionState, "fill");
  a.assert(atA.canvas !== atB.canvas, "different positions miss the cache");
  const posAReference = referenceContext();
  posAReference.font = font;
  posAReference.fillStyle = "rgba(204,26,51,1)";
  posAReference.fillText("Pos", 40, 60);
  compareAsset(a, posAReference, atA, "fillText:position-a");
  const posBReference = referenceContext();
  posBReference.font = font;
  posBReference.fillStyle = "rgba(204,26,51,1)";
  posBReference.fillText("Pos", 120, 60);
  compareAsset(a, posBReference, atB, "fillText:position-b");
  const atA2 = lab.rasterizer.text("Pos", 40, 60, positionState, "fill");
  a.assert(atA2.canvas === atA.canvas, "same position hits the cache");
  atA.release();
  atB.release();
  atA2.release();
  lab.rasterizer.dispose();
}

export const cases: CaseDefinition[] = [
  {
    id: "raster.text.placement",
    requirements: ["REN-01"],
    kind: "semantic",
    width: 200,
    height: 200,
    seed: 1,
    fonts: ["24px sans-serif"],
    run,
  },
];
