import { artifactHash, readArtifact, jsonHash, decode } from "./evidence.mjs";
const artifactKeys = [
  "reference",
  "actual",
  "difference",
  "displayReference",
  "displayActual",
  "displayDifference",
];
const nonempty = (s) => typeof s === "string" && s.trim().length > 0;
function reviewPart(value, ai = false) {
  return (
    value &&
    nonempty(value.reviewer) &&
    nonempty(value.date) &&
    Number.isFinite(Date.parse(value.date)) &&
    ["accepted", "rejected"].includes(value.verdict) &&
    (!ai || nonempty(value.notes))
  );
}
export async function assess(run, reviews, { directory, required, source }) {
  const problems = [],
    states = {};
  const problem = (reason, caseId, failed = false) =>
    problems.push({ reason, caseId, failed });
  if (
    run.schemaVersion !== 1 ||
    !nonempty(run.runId) ||
    !Array.isArray(run.results) ||
    !Array.isArray(run.requiredCaseIds)
  )
    throw Error("Invalid run schema");
  if (!Array.isArray(reviews)) throw Error("Reviews must be an array");
  if (run.scope !== "compatibility")
    problem("infrastructure-only: cannot accept compatibility");
  if (run.error) problem(run.error);
  if (run.commit !== source.commit || run.sourceHash !== source.sourceHash)
    problem("stale-source");
  if (
    !run.environment ||
    jsonHash(run.environment) !== run.environmentHash ||
    !nonempty(run.environment.browser) ||
    run.environment.browser === "unavailable" ||
    !nonempty(run.environment.gpu) ||
    run.environment.gpu === "unavailable"
  )
    problem("invalid-environment");
  const resultIds = new Set(),
    reviewIds = new Set();
  for (const r of run.results) {
    if (resultIds.has(r.caseId)) problem("duplicate-result", r.caseId, true);
    resultIds.add(r.caseId);
  }
  for (const r of reviews) {
    if (!r || !nonempty(r.caseId)) throw Error("Invalid review record");
    if (reviewIds.has(r.caseId)) problem("duplicate-review", r.caseId, true);
    reviewIds.add(r.caseId);
    if (!resultIds.has(r.caseId))
      problem("unknown-review-case", r.caseId, true);
  }
  const expected = new Map(required.map((c) => [c.id, c]));
  for (const c of required)
    if (!run.requiredCaseIds.includes(c.id))
      problem("missing-required-declaration", c.id);
  for (const id of run.requiredCaseIds)
    if (!expected.has(id)) problem("unknown-required-case", id);
  for (const c of required) {
    const r = run.results.find((r) => r.caseId === c.id);
    if (!r) {
      problem("missing-result", c.id);
      continue;
    }
    states[c.id] = c.kind === "semantic" ? "not-applicable" : "pending-review";
    if (r.kind !== c.kind) {
      problem("case-kind-mismatch", c.id, true);
      continue;
    }
    if (r.execution !== "executed") {
      problem(r.error || "not-executed", c.id);
      continue;
    }
    if (r.error || r.semantic === "fail") {
      problem(r.error || "semantic-failure", c.id, true);
      continue;
    }
    if (c.kind !== "render" && r.semantic !== "pass") {
      problem("missing-semantic-pass", c.id);
      continue;
    }
    if (
      c.kind === "render" &&
      !["pass", "not-applicable"].includes(r.semantic)
    ) {
      problem("invalid-semantic-status", c.id, true);
      continue;
    }
    if (c.kind === "semantic") continue;
    let digest;
    try {
      const bytes = {};
      for (const key of artifactKeys) {
        bytes[key] = await readArtifact(directory, r.artifacts?.[key]);
        decode(bytes[key]);
      }
      digest = artifactHash(bytes);
      if (digest !== r.artifactHash) throw Error("Artifact content changed");
    } catch (e) {
      problem(`invalid-artifacts: ${e.message}`, c.id);
      continue;
    }
    const review = reviews.find((v) => v.caseId === c.id);
    const bound =
      review &&
      ["runId", "commit", "sourceHash", "environmentHash"].every(
        (key) => review[key] === run[key],
      ) &&
      review.artifactHash === digest;
    if (!bound || !reviewPart(review.human) || !reviewPart(review.ai, true)) {
      problem(
        "pending-review: missing, incomplete or stale human/AI record",
        c.id,
      );
      continue;
    }
    if (
      review.human.verdict === "rejected" ||
      review.ai.verdict === "rejected"
    ) {
      states[c.id] = "rejected";
      problem("render-rejected", c.id, true);
    } else states[c.id] = "accepted";
  }
  // Do not ignore additional executed/failed cases supplied by a feature.
  for (const r of run.results)
    if (!expected.has(r.caseId)) problem("unexpected-result", r.caseId);
  return {
    status: problems.some((p) => p.failed)
      ? "failed"
      : problems.length
        ? "incomplete"
        : "accepted",
    code: problems.some((p) => p.failed) ? 1 : problems.length ? 2 : 0,
    problems,
    states,
  };
}
