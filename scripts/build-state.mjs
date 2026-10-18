import { readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { discover } from "./discover.mjs";
import { provenance } from "./provenance.mjs";
import { hash, jsonHash } from "./hash.mjs";
async function outputHash(root) {
  const paths = [
    ...(await discover(join(root, "dist"), "")),
    ...(await discover(join(root, ".build"), "")),
  ].filter((p) => p !== join(root, ".build", "stamp.json"));
  return jsonHash(
    await Promise.all(
      paths.map(async (p) => [relative(root, p), hash(await readFile(p))]),
    ),
  );
}
export async function recordBuild(root, sourceHash) {
  if ((await provenance(root)).sourceHash !== sourceHash)
    throw Error("Source changed during build");
  await writeFile(
    join(root, ".build", "stamp.json"),
    JSON.stringify({ sourceHash, outputHash: await outputHash(root) }),
  );
}
export async function assertCurrentBuild(root) {
  try {
    const stamp = JSON.parse(
      await readFile(join(root, ".build", "stamp.json"), "utf8"),
    );
    if (
      stamp.sourceHash !== (await provenance(root)).sourceHash ||
      stamp.outputHash !== (await outputHash(root))
    )
      throw Error("stale");
  } catch {
    throw Error(
      "Missing, stale or modified TypeScript build; run pnpm run build",
    );
  }
}
