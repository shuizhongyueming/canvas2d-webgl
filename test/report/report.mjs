import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readArtifact } from "../harness/evidence.mjs";
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export async function report(run, assessment, directory) {
  const sections = [];
  for (const r of run.results) {
    const images = [];
    for (const [key, path] of Object.entries(r.artifacts || {})) {
      try {
        const bytes = await readArtifact(directory, path);
        images.push(
          `<figure><figcaption>${escape(key)}</figcaption><img alt="${escape(key)}" src="data:image/png;base64,${bytes.toString("base64")}"></figure>`,
        );
      } catch (e) {
        images.push(`<p>Missing artifact: ${escape(e.message)}</p>`);
      }
    }
    const issues = assessment.problems.filter((p) => p.caseId === r.caseId);
    sections.push(
      `<article><h2>${escape(r.caseId)}</h2><p>execution: <b>${escape(r.execution)}</b> · semantic: <b>${escape(r.semantic)}</b> · render: <b>${escape(assessment.states[r.caseId] || r.render)}</b></p><pre>${escape(r.error || "")}${escape(issues.map((p) => p.reason).join("\n"))}</pre><div class="images">${images.join("")}</div><details><summary>Observations / difference locations / inputs</summary><pre>${escape(JSON.stringify({ observations: r.observations, checks: r.checks, difference: r.difference, injection: r.injection, input: run.cases?.find((c) => c.id === r.caseId) }, null, 2))}</pre></details></article>`,
    );
  }
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Canvas evidence ${escape(run.runId)}</title><style>body{font:15px system-ui;margin:32px;color:#17202b;background:#f4f6f8}h1{font-size:26px}article{background:white;border:1px solid #dce1e7;border-radius:8px;padding:20px;margin:20px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}.images{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}figure{margin:0}figcaption{padding:8px 0;font-weight:600}img{max-width:100%;image-rendering:pixelated;background:repeating-conic-gradient(#ddd 0% 25%,white 0% 50%) 0/16px 16px;border:1px solid #ddd}input{padding:10px;width:min(480px,90%)}.notice{border-left:4px solid #b66a00;padding:12px;background:#fff3d9}@media(max-width:700px){.images{grid-template-columns:1fr}body{margin:12px}}</style><h1>Canvas test evidence</h1><p class="notice">${escape(run.scope)} · acceptance: ${escape(assessment.status)}. Collection success is not rendering acceptance. Difference pixels locate changes; no tolerance or automatic pixel verdict is applied.</p><p>Run ${escape(run.runId)} · commit ${escape(run.commit)} · ${run.dirty ? "dirty source snapshot" : "clean source"}</p><details><summary>Environment and integrity</summary><pre>${escape(JSON.stringify({ environment: run.environment, sourceHash: run.sourceHash, environmentHash: run.environmentHash, problems: assessment.problems.filter((p) => !p.caseId) }, null, 2))}</pre></details><p>Review both scene images and display screenshots. Fill reviews.template.json with separate human and AI identities, dates, verdicts and AI notes, then rerun report with --reviews. The template is not an approval.</p><input id="filter" aria-label="Filter cases" placeholder="Filter by case ID or status">${sections.join("")}<script>document.querySelector('#filter').addEventListener('input',e=>{for(const a of document.querySelectorAll('article'))a.hidden=!a.textContent.toLowerCase().includes(e.target.value.toLowerCase())})</script></html>`;
  const path = join(directory, "report.html");
  await writeFile(path, html);
  return path;
}
