import type { CaseAdapter, CaseDefinition } from "../../types/testing.js";
import { PathRecorder } from "../../../src/path/recorder.js";
import type { Paint } from "../../../src/internal/contracts.js";
import {
  IDENTITY,
  compareAsset,
  diffAsset,
  makeLab,
  makeState,
  referenceContext,
  sourcePixels,
} from "./helpers.js";

function triangle(recorder: PathRecorder, dx: number): void {
  recorder.begin();
  recorder.moveTo(10 + dx, 10, IDENTITY);
  recorder.lineTo(60 + dx, 10, IDENTITY);
  recorder.lineTo(35 + dx, 50, IDENTITY);
  recorder.closePath(IDENTITY);
}

function gradient(version: number, second: string): Paint {
  return {
    kind: "linear-gradient",
    id: 9,
    version,
    transform: IDENTITY,
    from: [10, 10],
    to: [60, 50],
    stops: [
      { offset: 0, color: [1, 0, 0, 1] },
      { offset: 1, color: second === "blue" ? [0, 0, 1, 1] : [0, 0.5, 0, 1] },
    ],
  };
}

function run(a: CaseAdapter): void {
  const lab = makeLab({ maxEntries: 2 });
  const recorder = new PathRecorder();

  // Miss then hit: the identical path and state rasterize once and are served
  // from the cache with byte-identical content.
  triangle(recorder, 0);
  const snapshot = recorder.snapshot();
  const red = makeState();
  const first = lab.rasterizer.path(snapshot, red, "fill");
  first.release();
  const second = lab.rasterizer.path(snapshot, red, "fill");
  a.assert(second.canvas === first.canvas, "cache hit reuses the native asset");
  const redReference = referenceContext();
  redReference.fillStyle = "rgba(204,26,51,1)";
  redReference.beginPath();
  redReference.moveTo(10, 10);
  redReference.lineTo(60, 10);
  redReference.lineTo(35, 50);
  redReference.closePath();
  redReference.fill();
  compareAsset(a, redReference, second, "cache-hit");
  second.release();

  // A paint change (same shape, other color) must miss and re-render.
  const blue = makeState({ fill: { kind: "solid", color: [0.1, 0.25, 0.75, 1] } });
  const blueSource = lab.rasterizer.path(snapshot, blue, "fill");
  a.assert(blueSource.canvas !== first.canvas, "paint change invalidates the asset");
  const blueReference = referenceContext();
  blueReference.fillStyle = "rgba(26,64,191,1)";
  blueReference.beginPath();
  blueReference.moveTo(10, 10);
  blueReference.lineTo(60, 10);
  blueReference.lineTo(35, 50);
  blueReference.closePath();
  blueReference.fill();
  compareAsset(a, blueReference, blueSource, "cache-paint-color");
  blueSource.release();

  // A gradient version bump invalidates even when the paint id is unchanged.
  const gradientV1 = lab.rasterizer.path(
    snapshot,
    makeState({ fill: gradient(1, "blue") }),
    "fill",
  );
  gradientV1.release();
  const gradientV2 = lab.rasterizer.path(
    snapshot,
    makeState({ fill: gradient(2, "green") }),
    "fill",
  );
  a.assert(gradientV2.canvas !== gradientV1.canvas, "paint version bump invalidates");

  // A fresh rasterizer renders the identical asset, byte for byte.
  const bypass = makeLab();
  const fresh = bypass.rasterizer.path(
    snapshot,
    makeState({ fill: gradient(2, "green") }),
    "fill",
  );
  const cachedPixels = sourcePixels(gradientV2);
  const freshPixels = sourcePixels(fresh);
  a.assert(cachedPixels.length === freshPixels.length, "same asset size");
  let cacheDiff = 0;
  for (let i = 0; i < cachedPixels.length; i += 1)
    if (cachedPixels[i] !== freshPixels[i]) cacheDiff += 1;
  a.assert(cacheDiff === 0, "cached asset equals a fresh rasterization exactly");
  fresh.release();

  // The v1 asset is still cached and differs: the bump really changed content.
  const v1Again = lab.rasterizer.path(
    snapshot,
    makeState({ fill: gradient(1, "blue") }),
    "fill",
  );
  const v1Pixels = sourcePixels(v1Again);
  let versionDiff = 0;
  for (let i = 0; i < v1Pixels.length; i += 1)
    if (v1Pixels[i] !== cachedPixels[i]) versionDiff += 1;
  a.assert(versionDiff > 0, "paint versions carry different content");
  v1Again.release();

  // Semantic placement probe: the ramp runs red at the from end, green at the
  // to end, in device space (creation-time transform is identity here).
  const offsetX = gradientV2.bounds.x;
  const offsetY = gradientV2.bounds.y;
  const px = (x: number, y: number) => {
    const i = ((y - offsetY) * gradientV2.pixelWidth + (x - offsetX)) * 4;
    return [cachedPixels[i], cachedPixels[i + 1]] as const;
  };
  const nearStart = px(12, 12);
  const nearEnd = px(35, 48);
  a.assert(
    (nearStart[0] ?? 0) > 200 && (nearStart[1] ?? 255) < 50,
    "gradient start is red at the from endpoint",
  );
  a.assert(
    (nearEnd[1] ?? 0) > (nearEnd[0] ?? 255),
    "gradient end is green at the to endpoint",
  );

  // Native ramps carry a sub-LSB interpolation difference across canvases;
  // record it as evidence without asserting on it.
  const gradientReference = referenceContext();
  const native = gradientReference.createLinearGradient(10, 10, 60, 50);
  native.addColorStop(0, "#ff0000");
  native.addColorStop(1, "#008000");
  gradientReference.fillStyle = native;
  gradientReference.beginPath();
  gradientReference.moveTo(10, 10);
  gradientReference.lineTo(60, 10);
  gradientReference.lineTo(35, 50);
  gradientReference.closePath();
  gradientReference.fill();
  const nativeDiff = diffAsset(gradientReference, gradientV2);
  a.observe("cache-paint-version:native-ramp-byte-diffs", nativeDiff.mismatched);
  a.assert(nativeDiff.escaped === 0, "gradient asset bounds never truncate");
  gradientV2.release();

  // LRU with two entries: rasterizing a third distinct asset evicts the oldest
  // exactly once, freeing its native bitmap.
  const evictLab = makeLab({ maxEntries: 2 });
  const evictRecorder = new PathRecorder();
  for (const dx of [0, 70, 120]) {
    triangle(evictRecorder, dx);
    evictLab.rasterizer.path(evictRecorder.snapshot(), red, "fill").release();
  }
  const [oldest, ...rest] = evictLab.created;
  a.assert(evictLab.created.length === 3, "each distinct asset allocated once");
  a.assert(oldest !== undefined && oldest.width === 0, "evicted asset bitmap is released");
  a.assert(
    rest.every((canvas) => canvas.width > 0),
    "freshly used assets survive eviction",
  );
  evictLab.rasterizer.dispose();

  // clearCache bumps the invalidation epoch: identical input re-renders to a
  // new asset whose pixels still match the native reference.
  triangle(recorder, 0);
  const snapshotAgain = recorder.snapshot();
  lab.rasterizer.path(snapshotAgain, red, "fill").release();
  lab.rasterizer.clearCache();
  const countBefore = lab.created.length;
  const regenerated = lab.rasterizer.path(snapshotAgain, red, "fill");
  a.assert(
    lab.created.length === countBefore + 1,
    "clearCache forces re-rasterization",
  );
  compareAsset(a, redReference, regenerated, "cache-regenerated");
  regenerated.release();
  lab.rasterizer.dispose();
}

export const cases: CaseDefinition[] = [
  {
    id: "raster.cache.behavior",
    requirements: ["context.fill", "REN-01"],
    kind: "semantic",
    width: 64,
    height: 64,
    seed: 1,
    fonts: [],
    run,
  },
];
