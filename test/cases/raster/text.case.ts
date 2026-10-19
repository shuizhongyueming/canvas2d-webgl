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
  lab.rasterizer.dispose();
}

export const cases: CaseDefinition[] = [
  {
    id: "raster.text.placement",
    requirements: ["context.fillText", "context.strokeText", "context.measureText"],
    kind: "semantic",
    width: 64,
    height: 64,
    seed: 1,
    fonts: ["24px sans-serif"],
    run,
  },
];
