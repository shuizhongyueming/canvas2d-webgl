import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assess } from "./acceptance.mjs";
import { encode, artifactHash, jsonHash } from "./evidence.mjs";
import { report } from "../report/report.mjs";
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "canvas-evidence-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bytes = {},
    artifacts = {};
  for (const key of [
    "reference",
    "actual",
    "difference",
    "displayReference",
    "displayActual",
    "displayDifference",
  ]) {
    bytes[key] = encode({
      width: 1,
      height: 1,
      data: Buffer.from([10, 20, 30, 255]),
    });
    artifacts[key] = `${key}.png`;
    await writeFile(join(directory, artifacts[key]), bytes[key]);
  }
  const source = { commit: "a", sourceHash: "snapshot" },
    environment = { browser: "chromium", gpu: "real", dpr: 1 };
  const run = {
    schemaVersion: 1,
    runId: "run-a",
    ...source,
    scope: "compatibility",
    dirty: false,
    environment,
    environmentHash: jsonHash(environment),
    requiredCaseIds: ["case"],
    results: [
      {
        caseId: "case",
        kind: "render",
        execution: "executed",
        semantic: "not-applicable",
        render: "pending-review",
        artifacts,
        artifactHash: artifactHash(bytes),
      },
    ],
  };
  const reviews = [
    {
      caseId: "case",
      runId: run.runId,
      ...source,
      environmentHash: run.environmentHash,
      artifactHash: run.results[0].artifactHash,
      human: {
        reviewer: "fixture-human",
        date: "2026-10-17",
        verdict: "accepted",
      },
      ai: {
        reviewer: "fixture-ai",
        date: "2026-10-17",
        verdict: "accepted",
        notes: "Synthetic validator unit test only",
      },
    },
  ];
  return {
    run,
    reviews,
    options: { directory, source, required: [{ id: "case", kind: "render" }] },
  };
}
test("acceptance requires both bound reviews, and report recomputes render status", async (t) => {
  const f = await fixture(t);
  assert.equal((await assess(f.run, [], f.options)).code, 2);
  const ok = await assess(f.run, f.reviews, f.options);
  assert.equal(ok.code, 0);
  assert.equal(ok.states.case, "accepted");
  await report(f.run, ok, f.options.directory);
  f.reviews[0].human = null;
  assert.equal((await assess(f.run, f.reviews, f.options)).code, 2);
});
test("old run/commit/environment/artifact/source reviews are never reused", async (t) => {
  const f = await fixture(t);
  for (const key of [
    "runId",
    "commit",
    "environmentHash",
    "artifactHash",
    "sourceHash",
  ]) {
    const reviews = structuredClone(f.reviews);
    reviews[0][key] = "old";
    assert.equal((await assess(f.run, reviews, f.options)).code, 2, key);
  }
  assert.equal(
    (
      await assess(f.run, f.reviews, {
        ...f.options,
        source: { ...f.options.source, commit: "new" },
      })
    ).code,
    2,
  );
  f.run.environment.dpr = 2;
  assert.equal((await assess(f.run, f.reviews, f.options)).code, 2);
});
test("missing, modified and path-escaping artifacts block even with accepted reviews", async (t) => {
  const f = await fixture(t);
  await writeFile(
    join(f.options.directory, "actual.png"),
    encode({ width: 1, height: 1, data: Buffer.from([0, 0, 0, 0]) }),
  );
  assert.equal((await assess(f.run, f.reviews, f.options)).code, 2);
  await rm(join(f.options.directory, "actual.png"));
  assert.equal((await assess(f.run, f.reviews, f.options)).code, 2);
  f.run.results[0].artifacts.reference = "../outside.png";
  assert.equal((await assess(f.run, f.reviews, f.options)).code, 2);
});
test("missing cases, skips, missing semantics, self tests and reduced required sets cannot pass", async (t) => {
  const f = await fixture(t);
  for (const mutate of [
    (r) => (r.results = []),
    (r) => (r.results[0].execution = "not-run"),
    (r) => (r.scope = "infrastructure-self-test"),
    (r) => (r.requiredCaseIds = []),
    (r) => (r.results[0].kind = "semantic"),
  ]) {
    const run = structuredClone(f.run);
    mutate(run);
    assert.notEqual((await assess(run, f.reviews, f.options)).code, 0);
  }
  const required = [...f.options.required, { id: "missing", kind: "semantic" }];
  assert.equal(
    (await assess(f.run, f.reviews, { ...f.options, required })).code,
    2,
  );
});
test("explicit rejection, semantic failure and duplicate records fail", async (t) => {
  const f = await fixture(t);
  const rejected = structuredClone(f.reviews);
  rejected[0].ai.verdict = "rejected";
  assert.equal((await assess(f.run, rejected, f.options)).code, 1);
  f.run.results[0].semantic = "fail";
  assert.equal((await assess(f.run, f.reviews, f.options)).code, 1);
  f.run.results[0].semantic = "not-applicable";
  f.run.results.push(f.run.results[0]);
  assert.equal((await assess(f.run, f.reviews, f.options)).code, 1);
});

test("dirty or unspecified source snapshots cannot be accepted despite valid reviews", async (t) => {
  const f = await fixture(t);
  for (const dirty of [true, undefined]) {
    const run = { ...f.run, dirty };
    const assessment = await assess(run, f.reviews, f.options);
    assert.equal(assessment.code, 2);
    const html = await readFile(
      await report(run, assessment, f.options.directory),
      "utf8",
    );
    assert.doesNotMatch(html, /clean source/);
    assert.match(
      html,
      dirty === true ? /dirty source snapshot/ : /unknown source state/,
    );
  }
});

test("report displays imported identities and notes without treating stale reviews as valid", async (t) => {
  const f = await fixture(t);
  f.reviews[0].human.reviewer = "<script>not markup</script>";
  f.reviews[0].commit = "old";
  const assessment = await assess(f.run, f.reviews, f.options);
  assert.equal(assessment.code, 2);
  const path = await report(f.run, assessment, f.options.directory, f.reviews);
  const html = await readFile(path, "utf8");
  assert.match(html, /&lt;script&gt;not markup&lt;\/script&gt;/);
  assert.match(html, /pending-review/);
  assert.match(html, /Synthetic validator unit test only/);
});

test("report refuses repository source and build output directories before writing", async (t) => {
  const f = await fixture(t);
  const root = f.options.directory;
  for (const name of ["src", ".build", "dist"]) {
    const directory = join(root, name);
    await mkdir(directory);
    await assert.rejects(
      report(f.run, {}, directory, [], root),
      /Output inside repository/,
    );
    await assert.rejects(readFile(join(directory, "report.html")), {
      code: "ENOENT",
    });
  }
});
