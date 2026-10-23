import { provenance } from "./provenance.mjs";
import { recordBuild } from "./build-state.mjs";
import { rm, cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkBrowserImports } from "./browser-imports.mjs";
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
await rm(new URL("../.build-live/", import.meta.url), {
  recursive: true,
  force: true,
});
const compiler =
  process.platform === "win32"
    ? "node_modules/.bin/tsc.cmd"
    : "node_modules/.bin/tsc";
for (const project of [
  "tsconfig.build.json",
  "tsconfig.package.json",
  "tsconfig.live.json",
]) {
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
  // 实时对比工具浏览器模块输出到 dist/live/，与库和用例一并由
  // browser-imports 检查约束：Node fs/PNG 等依赖不得进入浏览器。
  if (project === "tsconfig.live.json")
    await cp(
      new URL("../.build-live/test/live/", import.meta.url),
      new URL("../dist/live/", import.meta.url),
      { recursive: true },
    );
}
const moduleCount = await checkBrowserImports(root);
await recordBuild(root, sourceHash);
console.log(
  `Compiled ${moduleCount} TypeScript browser modules, declarations and browser cases.`,
);
