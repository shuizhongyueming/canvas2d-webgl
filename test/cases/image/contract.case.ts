import type { CaseDefinition } from "../../types/testing.js";
import { isCompat, loadFactory, makeTarget, outcome } from "../shared.js";
import { callRaw, loadImage, STRIPES_3x5 } from "../paint/fixtures.js";
import { dumpScene, pixelsEqual, rectMessage } from "../rect/helpers.js";
import { canvasToImage, cornerCanvas, drawImage } from "./helpers.js";

const base = {
  kind: "semantic" as const,
  width: 32,
  height: 32,
  seed: 1,
  fonts: [] as string[],
};

export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "context.drawImage.contract",
    requirements: ["context.drawImage"],
    async run(a) {
      const source = cornerCanvas();
      a.assert(
        typeof a.context.drawImage === "function",
        "drawImage is installed",
      );
      a.assert(
        drawImage(a.context, source, 0, 0) === undefined,
        "drawImage returns undefined",
      );
      for (const [i, value] of [null, 42, {}, new ImageData(1, 1)].entries())
        a.observe(
          `invalid-${i}`,
          outcome(() => callRaw(a.context, "drawImage", value, 0, 0)),
        );
      for (const n of [0, 1, 2, 4, 6, 7, 8])
        a.observe(
          `arity-${n}`,
          rectMessage(() =>
            callRaw(
              a.context,
              "drawImage",
              ...[source, 0, 0, 4, 4, 0, 0, 4, 4].slice(0, n),
            ),
          ),
        );
      for (const value of [NaN, Infinity, -Infinity, undefined])
        a.assert(
          outcome(() => callRaw(a.context, "drawImage", source, value, 0)) ===
            "ok",
          "nonfinite coordinates do nothing",
        );
      for (const value of [1n, Symbol("coordinate")])
        a.assert(
          outcome(() => callRaw(a.context, "drawImage", source, value, 0)) ===
            "TypeError",
          "invalid numeric conversions throw",
        );
      a.observe(
        "extra",
        outcome(() =>
          callRaw(
            a.context,
            "drawImage",
            source,
            0,
            0,
            4,
            4,
            8,
            8,
            4,
            4,
            Symbol("ignored"),
          ),
        ),
      );
    },
  },
  ...([3, 5, 9] as const).map(
    (arity): CaseDefinition => ({
      ...base,
      id: `context.drawImage.arity-${arity}`,
      requirements: ["context.drawImage", "IMG-01"],
      async run(a) {
        const image = await loadImage(STRIPES_3x5);
        if (arity === 3) drawImage(a.context, image, 4, 4);
        if (arity === 5) drawImage(a.context, image, 4, 4, 9, 15);
        if (arity === 9) drawImage(a.context, image, 1, 0, 1, 5, 4, 4, 1, 5);
        const scene = await dumpScene(a);
        const samples =
          arity === 3
            ? [
                [4, 4, 255, 0, 0],
                [5, 4, 0, 255, 0],
                [6, 4, 0, 0, 255],
              ]
            : arity === 5
              ? [
                  [5, 11, 255, 0, 0],
                  [8, 11, 0, 255, 0],
                  [11, 11, 0, 0, 255],
                ]
              : [[4, 6, 0, 255, 0]];
        for (const [x, y, r, g, b] of samples)
          a.assert(
            pixelsEqual(scene.pixel(x!, y!), [r!, g!, b!, 255]),
            "overload lands the expected source texel",
          );
        a.assert(
          scene.pixel(3, 4)[3] === 0,
          "outside destination remains clear",
        );
      },
    }),
  ),
  ...(["CORS-clean-HTMLImageElement", "CORS-clean-native-canvas"] as const).map(
    (sourceType): CaseDefinition => ({
      ...base,
      id: `context.drawImage.source-${sourceType}`,
      requirements: ["context.drawImage", "IMG-01"],
      async run(a) {
        const canvas = cornerCanvas();
        const source =
          sourceType === "CORS-clean-HTMLImageElement"
            ? await canvasToImage(canvas)
            : canvas;
        a.context.fillStyle = "#ffff00";
        a.context.fillRect(0, 0, 32, 32);
        drawImage(a.context, source, 4, 4);
        const scene = await dumpScene(a);
        for (const [x, y, color] of [
          [4, 4, [255, 0, 0, 255]],
          [7, 4, [0, 255, 0, 255]],
          [4, 7, [0, 0, 255, 255]],
          [7, 7, [255, 255, 255, 255]],
          [5, 5, [255, 255, 0, 255]],
        ] as const)
          a.assert(
            pixelsEqual(scene.pixel(x, y), color),
            "orientation and transparent source-over are preserved",
          );
      },
    }),
  ),
  {
    ...base,
    id: "IMG-03.reject-compat-source",
    requirements: ["IMG-03", "context.drawImage"],
    async run(a) {
      const expected = isCompat(a) ? "unsupported-api" : "ok";
      for (const source of [a.canvas, document.getElementById("target")])
        a.assert(
          outcome(() => callRaw(a.context, "drawImage", source, 0, 0)) ===
            expected,
          "own facade and target follow approved rejection",
        );
      if (isCompat(a)) {
        const { createCompatCanvas } = await loadFactory();
        const other = createCompatCanvas(makeTarget());
        try {
          if (
            outcome(() => callRaw(a.context, "drawImage", other, 0, 0)) !==
            "unsupported-api"
          )
            throw new Error("other compat source was not rejected");
        } finally {
          other.dispose();
        }
      }
    },
  },
];
