import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { provenance } from "../../scripts/provenance.mjs";
import { recordBuild, assertCurrentBuild } from "../../scripts/build-state.mjs";
test("build evidence rejects changed sources and tampered emitted modules", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-ts-build-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init");
  await writeFile(join(root, ".gitignore"), ".build/\ndist/\n");
  await writeFile(join(root, "source.ts"), "export const value: number = 1;");
  git("add", ".");
  git(
    "-c",
    "user.name=Harness Test",
    "-c",
    "user.email=harness@example.invalid",
    "commit",
    "-m",
    "fixture",
  );
  await mkdir(join(root, ".build"));
  await mkdir(join(root, "dist"));
  await writeFile(join(root, "dist", "index.js"), "export const value = 1;");
  await assert.rejects(assertCurrentBuild(root), /TypeScript build/);
  const sourceHash = (await provenance(root)).sourceHash;
  await recordBuild(root, sourceHash);
  await assertCurrentBuild(root);
  await writeFile(join(root, "source.ts"), "export const value: number = 2;");
  await assert.rejects(assertCurrentBuild(root), /TypeScript build/);
  await assert.rejects(recordBuild(root, sourceHash), /Source changed/);
  await writeFile(join(root, "source.ts"), "export const value: number = 1;");
  await assertCurrentBuild(root);
  await writeFile(
    join(root, ".build", "case.js"),
    "export const injected = true;",
  );
  await assert.rejects(assertCurrentBuild(root), /TypeScript build/);
  await rm(join(root, ".build", "case.js"));
  await assertCurrentBuild(root);
  await writeFile(join(root, "dist", "index.js"), "export const value = 3;");
  await assert.rejects(assertCurrentBuild(root), /TypeScript build/);
});
