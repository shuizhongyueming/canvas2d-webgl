import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collect } from "../test/harness/collect.mjs";
import { assess } from "../test/harness/acceptance.mjs";
import { report } from "../test/report/report.mjs";
import { loadCatalog, requiredCases } from "../test/harness/catalog.mjs";
import { provenance } from "../test/harness/provenance.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: "string" },
      case: { type: "string" },
      run: { type: "string" },
      reviews: { type: "string" },
      "self-test": { type: "boolean" },
      software: { type: "boolean" },
      executable: { type: "string" },
      "disable-gpu": { type: "boolean" },
    },
  });
  const [stage] = positionals;
  if (
    positionals.length !== 1 ||
    !["browser", "report", "acceptance"].includes(stage)
  )
    throw Error("Expected browser, report or acceptance");
  if (stage === "browser") {
    if (!values.output) throw Error("browser requires --output <directory>");
    if (values["disable-gpu"] && !values["self-test"])
      throw Error("--disable-gpu is only an infrastructure fault injection");
    const result = await collect(root, {
      output: resolve(values.output),
      caseId: values.case,
      selfTest: values["self-test"],
      software: values.software,
      executable: values.executable,
      disableGPU: values["disable-gpu"],
    });
    console.log(
      JSON.stringify({
        run: result.path,
        scope: result.run.scope,
        collection:
          result.code === 0
            ? "complete"
            : result.code === 1
              ? "failed"
              : "blocked",
        compatibilityAccepted: false,
      }),
    );
    process.exitCode = result.code;
  } else {
    if (!values.run) throw Error(`${stage} requires --run <run.json>`);
    const path = resolve(values.run),
      directory = dirname(path),
      run = JSON.parse(await readFile(path, "utf8"));
    const reviews = values.reviews
      ? JSON.parse(await readFile(resolve(values.reviews), "utf8"))
      : [];
    const catalog = await loadCatalog(
      root,
      run.scope === "infrastructure-self-test",
    );
    const required = requiredCases(
      catalog,
      run.scope === "infrastructure-self-test",
      run.selectedCaseIds,
    );
    const assessment = await assess(run, reviews, {
      directory,
      required,
      source: await provenance(root),
    });
    if (stage === "report") {
      console.log(
        JSON.stringify({
          report: await report(run, assessment, directory, reviews),
          acceptance: assessment.status,
        }),
      );
      process.exitCode = 0;
    } else {
      console.log(JSON.stringify(assessment, null, 2));
      process.exitCode = assessment.code;
    }
  }
} catch (e) {
  console.error(e.stack || String(e));
  process.exitCode = 1;
}
