import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { discover } from "./discover.mjs";
const root = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL("../test/", import.meta.url));
const files = await discover(root, ".test.mjs");
if (!files.length) {
  console.error("No unit tests discovered; not a passing test run.");
  process.exitCode = 2;
} else {
  const result = spawnSync(process.execPath, ["--test", ...files], {
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
}
