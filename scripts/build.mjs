import { provenance } from "../test/harness/provenance.mjs";
import { recordBuild } from "./build-state.mjs";
import { rm, cp, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { discover } from "./discover.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const sourceHash = (await provenance(root)).sourceHash;
await rm(new URL("../.build/", import.meta.url), {
  recursive: true,
  force: true,
});
await rm(new URL("../dist/", import.meta.url), {
  recursive: true,
  force: true,
});
const compiler =
  process.platform === "win32"
    ? "node_modules/.bin/tsc.cmd"
    : "node_modules/.bin/tsc";
for (const project of ["tsconfig.build.json", "tsconfig.package.json"]) {
  const result = spawnSync(compiler, ["-p", project], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  if (project === "tsconfig.build.json")
    await cp(
      new URL("../.build/src/", import.meta.url),
      new URL("../dist/", import.meta.url),
      { recursive: true },
    );
}
const modules = await discover(root + "/dist", ".js");
if (!modules.length) throw Error("No runtime modules to build");
for (const path of modules) {
  const text = await readFile(path, "utf8");
  if (/\b(?:from\s*|import\s*\()\s*['"](?:node:|[^./])/.test(text))
    throw Error(`Runtime import must be a relative browser module: ${path}`);
}
await recordBuild(root, sourceHash);
console.log(
  `Compiled ${modules.length} TypeScript runtime modules, declarations and browser cases.`,
);
