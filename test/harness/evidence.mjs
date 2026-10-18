import { hash, jsonHash } from "../../scripts/hash.mjs";
export { hash, jsonHash } from "../../scripts/hash.mjs";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { PNG } from "pngjs";
export function diffPixels(a, b) {
  if (
    a.width !== b.width ||
    a.height !== b.height ||
    a.data.length !== b.data.length
  )
    throw Error("Image dimensions differ");
  const data = Buffer.alloc(a.data.length);
  let changedPixels = 0,
    minX = a.width,
    minY = a.height,
    maxX = -1,
    maxY = -1;
  for (let i = 0; i < a.data.length; i += 4) {
    let changed = false;
    for (let c = 0; c < 4; c++)
      if (a.data[i + c] !== b.data[i + c]) changed = true;
    if (!changed) continue;
    const x = (i / 4) % a.width,
      y = Math.floor(i / 4 / a.width);
    changedPixels++;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    data.set([255, 0, 180, 255], i);
  }
  return {
    width: a.width,
    height: a.height,
    data,
    changedPixels,
    bounds: changedPixels
      ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
      : null,
  };
}
export const encode = (value) => PNG.sync.write(value);
export const decode = (bytes) => PNG.sync.read(bytes);
export const artifactHash = (artifacts) =>
  jsonHash(
    Object.entries(artifacts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, bytes]) => [key, hash(bytes)]),
  );
export async function readArtifact(root, name) {
  if (typeof name !== "string" || !name) throw Error("Missing artifact path");
  const base = await realpath(root),
    path = await realpath(resolve(root, name));
  if (!path.startsWith(base + sep))
    throw Error("Artifact outside run directory");
  return readFile(path);
}
