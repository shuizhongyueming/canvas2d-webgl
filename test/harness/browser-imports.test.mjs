import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkBrowserImports } from "../../scripts/browser-imports.mjs";
test("browser import guard checks runtime and compiled cases including side effects", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-imports-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ["dist", ".build/test/cases/nested"])
    await mkdir(join(root, dir), { recursive: true });
  const runtime = join(root, "dist/index.js"),
    browserCase = join(root, ".build/test/cases/nested/example.case.js");
  await writeFile(runtime, 'export { value } from "./value.js";');
  for (const source of [
    'import "node:fs";',
    'import x from "pngjs";',
    'export { x } from "node:fs";',
    'import("node:fs");',
  ]) {
    await writeFile(browserCase, source);
    await assert.rejects(checkBrowserImports(root), /relative browser module/);
  }
  await writeFile(
    browserCase,
    'import "../shared.js"; import("./fixture.js");',
  );
  assert.equal(await checkBrowserImports(root), 2);
  await writeFile(runtime, 'import "node:fs";');
  await assert.rejects(checkBrowserImports(root), /relative browser module/);
});
