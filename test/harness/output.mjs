import { realpath } from "node:fs/promises";
import { dirname, basename, resolve, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";
async function physicalPath(path) {
  try {
    return await realpath(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return resolve(await physicalPath(parent), basename(path));
  }
}
export async function validateOutput(root, output) {
  const base = await realpath(root),
    target = await physicalPath(resolve(output));
  if (target !== base && !target.startsWith(base + sep)) return;
  const allowed = resolve(base, "test-results");
  if (target !== allowed && !target.startsWith(allowed + sep))
    throw Error("Output inside repository must be under ignored test-results/");
  try {
    execFileSync(
      "git",
      [
        "check-ignore",
        "--no-index",
        "--quiet",
        "--",
        relative(base, resolve(target, "__harness_probe__")),
      ],
      { cwd: base, stdio: "ignore" },
    );
  } catch {
    throw Error("Output test-results/ must be ignored by Git");
  }
}
