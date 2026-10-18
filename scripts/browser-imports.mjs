import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { discover } from "./discover.mjs";
export async function checkBrowserImports(root) {
  const modules = [
    ...(await discover(join(root, "dist"), ".js")),
    ...(await discover(join(root, ".build/test"), ".js")),
  ];
  if (!modules.length) throw Error("No browser modules to build");
  for (const path of modules) {
    const source = await readFile(path, "utf8");
    const imports = source.matchAll(
      /\b(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+)["']/g,
    );
    for (const [, specifier] of imports) {
      if (!specifier.startsWith("./") && !specifier.startsWith("../"))
        throw Error(
          `Runtime import must be a relative browser module: ${path}: ${specifier}`,
        );
    }
  }
  return modules.length;
}
