import { assertCurrentBuild } from "../../scripts/build-state.mjs";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { pathToFileURL } from "node:url";
import { discover } from "../../scripts/discover.mjs";
import { SUPPORT_MATRIX } from "../../dist/contracts/support.js";
import {
  apiCases,
  interactionCases,
} from "../../.build/test/cases/manifest/index.js";
export const requiredCatalog = [...apiCases, ...interactionCases];
export function validateCases(cases, requirements, required = requiredCatalog) {
  const ids = new Set();
  for (const c of cases) {
    if (!c || typeof c.id !== "string" || !/^[\w.:%()-]+$/.test(c.id))
      throw Error("Invalid case id");
    if (ids.has(c.id)) throw Error(`Duplicate case: ${c.id}`);
    ids.add(c.id);
    if (
      !["semantic", "render", "combined"].includes(c.kind) ||
      typeof c.run !== "function"
    )
      throw Error(`Invalid case: ${c.id}`);
    if (
      ![c.width, c.height].every(
        (n) => Number.isInteger(n) && n > 0 && n <= 4096,
      )
    )
      throw Error(`Invalid dimensions: ${c.id}`);
    if (
      !Number.isSafeInteger(c.seed) ||
      !Array.isArray(c.fonts) ||
      c.fonts.some((f) => typeof f !== "string")
    )
      throw Error(`Invalid inputs: ${c.id}`);
    if (!Array.isArray(c.requirements) || !c.requirements.length)
      throw Error(`Missing requirements: ${c.id}`);
    for (const r of c.requirements)
      if (!requirements.has(r)) throw Error(`Unknown requirement: ${r}`);
    const canonical = required.find((r) => r.id === c.id);
    if (
      canonical &&
      (canonical.kind !== c.kind ||
        canonical.requirements.some((r) => !c.requirements.includes(r)))
    )
      throw Error(`Required metadata changed: ${c.id}`);
  }
  return cases;
}
export async function loadCatalog(root, selfTest = false) {
  await assertCurrentBuild(root);
  const spec = await readFile(`${root}/docs/specs/canvas2d-webgl.md`, "utf8");
  const requirements = new Set(
    [
      ...SUPPORT_MATRIX.map((m) => m.id),
      ...spec.matchAll(/\b[A-Z]+-\d{2}\b/g),
    ].map((x) => (typeof x === "string" ? x : x[0])),
  );
  const paths = selfTest
    ? [`${root}/test/fixtures/infrastructure.case.ts`]
    : await discover(`${root}/test/cases`, ".case.ts");
  const definitions = [];
  for (const path of paths) {
    const compiled = `${root}/.build/${relative(root, path).replace(/\.ts$/, ".js")}`;
    const module = await import(pathToFileURL(compiled));
    if (!Array.isArray(module.cases))
      throw Error(`Missing cases export: ${path}`);
    for (const c of module.cases)
      definitions.push({
        ...c,
        module: "/" + relative(root, compiled).split("\\").join("/"),
      });
  }
  validateCases(definitions, requirements);
  return definitions;
}

export const SELF_TEST_CASE_IDS = Object.freeze([
  "self.native-pair",
  "self.local-difference",
  "self.display-difference",
]);
// The same catalog policy is used by collection and subsequent assessment.
export function requiredCases(catalog, selfTest, selectedCaseIds = []) {
  if (selfTest)
    return catalog.filter(
      (c) =>
        SELF_TEST_CASE_IDS.includes(c.id) || selectedCaseIds.includes(c.id),
    );
  return [
    ...requiredCatalog,
    ...catalog.filter((c) => !requiredCatalog.some((r) => r.id === c.id)),
  ];
}
