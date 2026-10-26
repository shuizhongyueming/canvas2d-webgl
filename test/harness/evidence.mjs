import { hash, jsonHash } from "../../scripts/hash.mjs";
export { hash, jsonHash } from "../../scripts/hash.mjs";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { PNG } from "pngjs";
import { diffPixels as coreDiffPixels } from "../live/measure/node.mjs";

// 严格差分逻辑委托浏览器/Node 共享纯核心（issue #68）；本层保留
// 既有返回形状 { width, height, data, changedPixels, bounds }，
// 既有报告与评审状态不因共享重构而变化。
export function diffPixels(a, b) {
  if (
    a.width !== b.width ||
    a.height !== b.height ||
    a.data.length !== b.data.length
  )
    throw Error("Image dimensions differ");
  const difference = coreDiffPixels(a, b);
  return {
    width: difference.width,
    height: difference.height,
    data: difference.data,
    changedPixels: difference.changedPixels,
    bounds: difference.bounds,
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
