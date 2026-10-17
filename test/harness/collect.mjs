import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { loadCatalog, requiredCatalog } from "./catalog.mjs";
import { launchDriver } from "./driver.mjs";
import { serve } from "./server.mjs";
import { provenance } from "./provenance.mjs";
import {
  hash,
  jsonHash,
  artifactHash,
  diffPixels,
  encode,
  decode,
} from "./evidence.mjs";
const metadata = (c) => ({
  id: c.id,
  kind: c.kind,
  requirements: c.requirements,
  width: c.width,
  height: c.height,
  fonts: c.fonts,
  seed: c.seed,
});
export async function collect(root, options) {
  const catalog = await loadCatalog(root, options.selfTest);
  const defaults = options.selfTest
    ? catalog.filter((c) =>
        ["self.native-pair", "self.local-difference"].includes(c.id),
      )
    : catalog;
  const selected = options.caseId
    ? catalog.filter((c) => c.id === options.caseId)
    : defaults;
  if (options.caseId && !selected.length)
    throw Error(`Unknown case: ${options.caseId}`);
  const required = options.selfTest
    ? defaults
    : [
        ...requiredCatalog,
        ...catalog.filter((c) => !requiredCatalog.some((r) => r.id === c.id)),
      ];
  const source = await provenance(root);
  const run = {
    schemaVersion: 1,
    runId: randomUUID(),
    ...source,
    scope: options.selfTest ? "infrastructure-self-test" : "compatibility",
    environment: {
      browser: "unavailable",
      gpu: "unavailable",
      dpr: 1,
      fonts: [...new Set(selected.flatMap((c) => c.fonts))],
      date: new Date().toISOString(),
      platform: process.platform,
    },
    requiredCaseIds: required.map((c) => c.id),
    selectedCaseIds: selected.map((c) => c.id),
    cases: catalog.map(metadata),
    results: [],
  };
  // Every collection gets a new directory; old reviews cannot follow an overwritten run.
  const output = join(options.output, run.runId);
  await mkdir(output, { recursive: true });
  const known = new Set(selected.map((c) => c.id));
  for (const c of required)
    if (!known.has(c.id))
      run.results.push({
        caseId: c.id,
        kind: c.kind,
        execution: "not-run",
        semantic: "not-applicable",
        render: c.kind === "semantic" ? "not-applicable" : "pending-review",
        error: catalog.some((x) => x.id === c.id)
          ? "not-selected"
          : "missing-implementation",
      });
  let server, driver;
  try {
    server = await serve(root);
    driver = await launchDriver(options);
    run.environment.browser = driver.version;
    run.environment.driver = driver.configuration;
    const probe = await driver.page(server.url);
    try {
      const environment = await probe.evaluate(async () => {
        const { probeGPU } = await import("/test/harness/browser.js");
        return {
          ...probeGPU(),
          dpr: devicePixelRatio,
          userAgent: navigator.userAgent,
          platform: navigator.platform,
        };
      });
      Object.assign(run.environment, environment);
    } finally {
      await probe.close();
    }
    for (const c of selected) {
      const pair = {};
      for (const side of ["reference", "actual"]) {
        const page = await driver.page(server.url);
        try {
          pair[side] = await page.evaluate(
            async (input) =>
              (await import("/test/harness/browser.js")).execute(input),
            {
              module: c.module,
              id: c.id,
              mode:
                side === "reference" || options.selfTest ? "native" : "compat",
            },
          );
          if (pair[side].scene) {
            pair[side].display = await page.screenshot();
            pair[side].scene = {
              width: pair[side].scene.width,
              height: pair[side].scene.height,
              data: Buffer.from(pair[side].scene.pixels),
            };
          }
        } catch (e) {
          pair[side] = {
            execution: "executed",
            semantic: "fail",
            error: String(e),
          };
        } finally {
          // Context close also releases resources when a hung page cannot run cleanup.
          await page.close();
        }
      }
      const ref = pair.reference,
        act = pair.actual;
      const failures = [ref, act].filter((r) => r.semantic === "fail");
      const blocked = [ref, act].some((r) => r.execution !== "executed");
      const semantic =
        c.kind === "render"
          ? "not-applicable"
          : isDeepStrictEqual(ref.observations, act.observations) &&
              isDeepStrictEqual(ref.checks, act.checks)
            ? "pass"
            : "fail";
      const result = {
        caseId: c.id,
        kind: c.kind,
        execution: blocked ? "blocked" : "executed",
        semantic: failures.length
          ? "fail"
          : blocked
            ? "not-applicable"
            : semantic,
        render: c.kind === "semantic" ? "not-applicable" : "pending-review",
        observations: { reference: ref.observations, actual: act.observations },
        checks: { reference: ref.checks, actual: act.checks },
        fonts: { reference: ref.fonts, actual: act.fonts },
      };
      const errors = [ref.error, act.error].filter(Boolean);
      if (errors.length) result.error = errors.join("\n");
      if (result.semantic === "fail" && !result.error)
        result.error = "Semantic observations or assertions differ";
      if (ref.scene && act.scene) {
        if (options.selfTest && c.id === "self.local-difference") {
          // Deliberate single-pixel mutation tests the locator, never tolerance calibration.
          act.scene.data.set([255, 0, 255, 255], (24 * c.width + 17) * 4);
          result.injection = {
            x: 17,
            y: 24,
            width: 1,
            height: 1,
            surface: "scene-only",
          };
        }
        try {
          const sceneDiff = diffPixels(ref.scene, act.scene),
            displayDiff = diffPixels(decode(ref.display), decode(act.display));
          const bytes = {
            reference: encode(ref.scene),
            actual: encode(act.scene),
            difference: encode(sceneDiff),
            displayReference: ref.display,
            displayActual: act.display,
            displayDifference: encode(displayDiff),
          };
          result.artifacts = {};
          for (const [name, data] of Object.entries(bytes)) {
            const path = `${hash(c.id).slice(0, 20)}-${name}.png`;
            await writeFile(join(output, path), data);
            result.artifacts[name] = path;
          }
          result.artifactHash = artifactHash(bytes);
          result.difference = {
            scene: {
              changedPixels: sceneDiff.changedPixels,
              bounds: sceneDiff.bounds,
            },
            display: {
              changedPixels: displayDiff.changedPixels,
              bounds: displayDiff.bounds,
            },
          };
        } catch (e) {
          result.semantic = "fail";
          result.error = String(e);
        }
      }
      run.results.push(result);
    }
  } catch (e) {
    run.error = String(e.stack || e);
    for (const c of selected)
      if (!run.results.some((r) => r.caseId === c.id))
        run.results.push({
          caseId: c.id,
          kind: c.kind,
          execution: "blocked",
          semantic: "not-applicable",
          render: c.kind === "semantic" ? "not-applicable" : "pending-review",
          error: run.error,
        });
  } finally {
    await driver?.close();
    await server?.close();
  }
  run.environmentHash = jsonHash(run.environment);
  // Records changes during collection, including an agent modifying a case mid-run.
  if (jsonHash(await provenance(root)) !== jsonHash(source))
    run.error = "Source changed during collection";
  await writeFile(
    join(output, "run.json"),
    JSON.stringify(run, null, 2) + "\n",
  );
  const reviews = run.results
    .filter((r) => r.artifactHash)
    .map((r) => ({
      caseId: r.caseId,
      runId: run.runId,
      commit: run.commit,
      sourceHash: run.sourceHash,
      environmentHash: run.environmentHash,
      artifactHash: r.artifactHash,
      human: null,
      ai: null,
    }));
  await writeFile(
    join(output, "reviews.template.json"),
    JSON.stringify(reviews, null, 2) + "\n",
  );
  const executed = run.results.filter((r) => known.has(r.caseId));
  const code = executed.some((r) => r.semantic === "fail")
    ? 1
    : run.error ||
        !executed.length ||
        executed.some((r) => r.execution !== "executed")
      ? 2
      : 0;
  return { code, path: join(output, "run.json"), run };
}
