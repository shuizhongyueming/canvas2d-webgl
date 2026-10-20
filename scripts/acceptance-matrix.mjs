import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SUPPORT_MATRIX } from "../dist/contracts/support.js";
import { apiCases, interactionCases } from "../.build/test/cases/manifest/index.js";
import { provenance } from "./provenance.mjs";
import { STATES, TICKETS, owners, stateOf, ticketOf } from "./matrix.mjs";

/**
 * Support-matrix reconciliation for one collected run. Groups the required case
 * catalog by the prerequisite ticket that owns each member and reports
 * execution / semantic / review state per group. It never derives a verdict
 * from code coverage, and pending reviews stay pending.
 *
 * Usage: node scripts/acceptance-matrix.mjs <run.json> [--out <file.md>]
 */
const args = process.argv.slice(2);
const runPath = args.find((value) => !value.startsWith("--"));
if (!runPath) {
  console.error("usage: acceptance-matrix <run.json> [--out <file.md>]");
  process.exitCode = 1;
  process.exit();
}
const outIndex = args.indexOf("--out");
const outPath = outIndex >= 0 ? args[outIndex + 1] : undefined;

const run = JSON.parse(await readFile(resolve(runPath), "utf8"));
const source = await provenance(resolve("."));
const results = new Map(run.results.map((result) => [result.caseId, result]));
const required = [...apiCases, ...interactionCases];
const ownerOf = owners();

/**
 * Every executed case counts: the required catalog plus any additional case a
 * feature or this ticket added. Additional cases are marked so the report can
 * distinguish "mandated by the matrix" from "extra evidence".
 */
const declared = new Set(required.map((entry) => entry.id));
const entries = [
  ...required,
  ...(run.cases ?? [])
    .filter((entry) => !declared.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      requirements: entry.requirements,
      extra: true,
    })),
];

const groups = new Map(TICKETS.map((ticket) => [ticket.id, []]));
const unassigned = [];
for (const entry of entries) {
  const ticket = ticketOf(entry, ownerOf);
  if (ticket) groups.get(ticket.id).push(entry);
  else unassigned.push(entry);
}

const lines = [];
const push = (...values) => lines.push(...values);
push(
  "# 支持矩阵覆盖对账",
  "",
  "本文件由 `node scripts/acceptance-matrix.mjs <run.json>` 生成，登记一次真实采集的用例执行与评审状态。",
  "统计单位是支持矩阵派生出的必需用例目录（成员、重载、取值、来源、渲染入口与交互 ID），不是代码行覆盖率；任何数值都不能替代人工+AI 渲染对评审。",
  "",
  "## 运行",
  "",
  `- 运行 ID：\`${run.runId}\``,
  `- commit：\`${run.commit}\`；dirty：\`${run.dirty}\``,
  `- 源快照：\`${run.sourceHash}\``,
  `- 环境：${run.environment.browser}；GPU：${run.environment.gpu}；DPR：${run.environment.dpr}`,
  `- 采集时间：${run.environment.date}`,
  `- 对账时工作区与运行一致：${
    source.commit === run.commit && source.sourceHash === run.sourceHash
      ? "是"
      : "否（运行已过期，需重新采集）"
  }`,
  `- 范围：\`${run.scope}\`（基础设施自检不能作为兼容验收）`,
  "",
  "## 状态词汇",
  "",
  "`semantic-pass` 语义用例通过；`pending-review` 渲染用例已执行但缺人工+AI 评审；`missing-implementation` 必需用例没有可执行定义；`blocked` 未执行；`semantic-fail` 语义失败。",
  "",
);

const totals = new Map(STATES.map((state) => [state, 0]));
const renderPending = [];
const missing = [];
const failures = [];
let total = 0;

for (const ticket of TICKETS) {
  const ticketEntries = groups.get(ticket.id);
  const counts = new Map(STATES.map((state) => [state, 0]));
  for (const entry of ticketEntries) {
    const state = stateOf(entry, results.get(entry.id));
    counts.set(state, (counts.get(state) ?? 0) + 1);
    totals.set(state, (totals.get(state) ?? 0) + 1);
    total += 1;
    if (state === "pending-review") renderPending.push(entry.id);
    if (state === "missing-implementation" || state === "missing")
      missing.push(entry.id);
    if (state === "semantic-fail" || state === "review-rejected")
      failures.push(entry.id);
  }
  const extraHere = ticketEntries.filter((entry) => entry.extra).length;
  push(
    `## ${ticket.label}（${ticket.id}）`,
    "",
    `用例 ${ticketEntries.length} 个（矩阵必需 ${ticketEntries.length - extraHere}，额外 ${extraHere}）。`,
    "",
    "| 状态 | 数量 |",
    "| --- | --- |",
  );
  for (const state of STATES)
    if ((counts.get(state) ?? 0) > 0)
      push(`| ${state} | ${counts.get(state)} |`);
  if (ticketEntries.length === 0) push("| （无） | 0 |");
  push("");
  const pending = ticketEntries.filter(
    (entry) => stateOf(entry, results.get(entry.id)) === "pending-review",
  );
  if (pending.length) {
    const pendingRequired = pending.filter((entry) => !entry.extra).length;
    push(
      `待评审渲染用例 ${pending.length} 个（其中矩阵必需 ${pendingRequired} 个）：`,
      "",
    );
    for (const entry of pending)
      push(`- \`${entry.id}\`${entry.extra ? "（额外证据）" : ""}`);
    push("");
  }
  const missingHere = ticketEntries.filter((entry) => {
    const state = stateOf(entry, results.get(entry.id));
    return state === "missing-implementation" || state === "missing";
  });
  if (missingHere.length) {
    push("缺可执行定义：", "");
    for (const entry of missingHere) push(`- \`${entry.id}\``);
    push("");
  }
}

push(
  "## 合计",
  "",
  `用例共 ${total} 个（矩阵必需 ${required.length}，额外 ${total - required.length}）。`,
  "",
  "| 状态 | 数量 |",
  "| --- | --- |",
);
for (const state of STATES)
  if ((totals.get(state) ?? 0) > 0)
    push(`| ${state} | ${totals.get(state)} |`);
push(
  "",
  `本运行不存在语义失败或评审拒绝：${failures.length === 0 ? "是" : "否"}`,
  `待评审渲染用例 ${renderPending.length} 个；缺定义 ${missing.length} 个。`,
  "",
  "## 排除项的显式错误检查",
  "",
  "每个 `policy: unsupported` 成员都有 `context.<member>.contract` 用例，compat 侧断言 `unsupported-api` 且 message 含 API 名，native 侧断言调用本身合法。",
  "",
  "| 成员 | 必需用例 | 本次状态 |",
  "| --- | --- | --- |",
);
for (const row of SUPPORT_MATRIX.filter(
  (item) => item.policy === "unsupported",
)) {
  const id = `${row.id}.contract`;
  const state = stateOf(
    { id, kind: "semantic", requirements: [row.id] },
    results.get(id),
  );
  push(`| \`${row.id}\` | \`${id}\` | ${state} |`);
}
push("");
if (unassigned.length) {
  push("## 未归组的用例", "");
  for (const entry of unassigned) push(`- \`${entry.id}\``);
  push("");
}
push(
  "## 与代码覆盖率的边界",
  "",
  "本对账只回答“矩阵中的每个成员、重载、取值、来源与交互是否被必需用例覆盖并如实执行”。它不测量源码行覆盖率，也不能把 `pending-review` 折算为通过；兼容结论仍需人工+AI 对同一运行的参考/兼容渲染对逐例评审。",
  "",
);

const markdown = lines.join("\n");
if (outPath) {
  await writeFile(resolve(outPath), markdown, "utf8");
  console.log(
    JSON.stringify({
      out: resolve(outPath),
      cases: total,
      required: required.length,
      pendingReview: renderPending.length,
      missing: missing.length,
      failures: failures.length,
    }),
  );
} else {
  process.stdout.write(markdown);
}
// Pending review is an expected open state, not a script failure; a semantic
// failure or a missing definition is.
if (failures.length || missing.length) process.exitCode = 1;
