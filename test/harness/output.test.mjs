import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateOutput } from "./output.mjs";
test("output rejects unignored repository paths and resolves symlink aliases", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "harness-output-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = join(temp, "repo");
  await mkdir(root);
  execFileSync("git", ["init", "--quiet", root]);
  await assert.rejects(
    validateOutput(root, join(root, "artifacts")),
    /must be under/,
  );
  await assert.rejects(
    validateOutput(root, join(root, "test-results", "run")),
    /must be ignored/,
  );
  await writeFile(join(root, ".gitignore"), "test-results/\n");
  await validateOutput(root, join(root, "test-results", "run"));
  await validateOutput(root, join(temp, "external"));
  await symlink(root, join(temp, "alias"));
  await assert.rejects(
    validateOutput(root, join(temp, "alias", "artifacts")),
    /must be under/,
  );
});
