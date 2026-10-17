import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { jsonHash, hash } from "./evidence.mjs";
export async function provenance(root) {
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const files = git(
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  )
    .split("\0")
    .filter(Boolean)
    .sort();
  const entries = [];
  for (const file of files) {
    try {
      entries.push([file, hash(await readFile(join(root, file)))]);
    } catch (e) {
      if (e.code === "ENOENT") entries.push([file, "deleted"]);
      else throw e;
    }
  }
  return {
    commit: git("rev-parse", "HEAD"),
    sourceHash: jsonHash(entries),
    dirty: !!git("status", "--porcelain"),
  };
}
