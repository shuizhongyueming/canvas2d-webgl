import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SUPPORT_MATRIX } from "../dist/contracts/support.js";
import { apiCases, interactionCases } from "../.build/test/cases/manifest/index.js";
import { provenance } from "./provenance.mjs";

/**
 * Support-matrix reconciliation for one collected run. It groups the required
 * case catalog by the prerequisite implementation ticket that owns each member
 * and reports execution / semantic / review state per group. It never derives a
 * verdict from code coverage, and pending reviews stay pending.
 *
 * Usage: node scripts/acceptance-matrix.mjs <run.json> [--out <file.md>]
 */
const args = process.argv.slice(2);
const runPath = args.find((value) => !value.startsWith("--"));
if (!runPath) {
  console.error("acceptance-matrix requires --run <run.json>");
  process.exitCode = 1;
  process.exit();
}
const outIndex = args.indexOf("--out");
const outPath = outIndex >= 0 ? args[outIndex + 1] : undefined;

/**
 * Who owns each prerequisite ticket. `rows` names the matrix owners whose
 * required cases belong to the ticket; `prefixes` names the interaction case
 * requirement prefixes that the ticket is accountable for.
 */
const TICKETS = [
  {
    id: "shuizhongyueming/canvas2d-webgl#17",
    label: "矩形三方法",
    rows: ["rect"],
    prefixes: ["CAN-04", "CAN-05"],
  },
  {
    id: "shuizhongyueming/canvas2d-webgl#18",
    label: "drawImage 重载与外部 canvas 顺序",
    rows: ["image"],
    prefixes: ["IMG-02", "IMG-03", "ACC-04"],
  },
  {
    id: "shuizhongyueming/canvas2d-webgl#19",
    label: "公开路径填充描边及 paint 集成",
    rows: ["path"],
    prefixes: [],
  },
  {
    id: "shuizhongyueming/canvas2d-webgl#20",
    label: "文字光栅化、布局与 width 测量",
    rows: ["text"],
    prefixes: [],
  },
  {
    id: "shuizhongyueming/canvas2d-webgl#21",
    label: "模板裁剪、evenodd 与状态恢复",
    rows: ["clip"],
    prefixes: [],
  },
  {
    id: "shuizhongyueming/canvas2d-webgl#22",
    label: "操作级合成模式与 brightness",
    rows: ["composite"],
    prefixes: [],
  },
  {
    id: "shuizhongyueming/canvas2d-webgl#23",
    label: "尺寸重置、dispose 与上下文恢复",
    rows: ["lifecycle"],
    prefixes: ["LIFE-01", "LIFE-02", "LIFE-03", "ACC-05"],
  },
  {
    id: "shuizhongyueming/canvas2d-webgl#24",
    label: "跨特性组合（本票新增）",
    rows: [],
    prefixes: ["ACC-03"],
  },
  {
    id: "earlier",
    label: "更早的工程/状态/画布/paint 票",
    rows: ["canvas", "state", "paint", "gpu", "context"],
    prefixes: ["CAN-01", "CAN-02", "CAN-03", "ACC-01"],
  },
];

const run = JSON.parse(await readFile(resolve(runPath), "utf8"));
const source = await provenance(resolve("."));
const results = new Map(run.results.map((result) => [result.caseId, result]));
const required = [...apiCases, ...interactionCases];

const ownerOf = new Map(SUPPORT_MATRIX.map((row) => [row.id, row.owner]));
const policyOf = new Map(SUPPORT_MATRIX.map((row) => [row.id, row.policy]));

function ticketOf(entry) {
  const owners = entry.requirements
    .map((requirement) => ownerOf.get(requirement))
    .filter((owner) => owner !== undefined);
  for (const ticket of TICKETS)
    if (owners.some((owner) => ticket.rows.includes(owner))) return ticket;
  for (const ticket of TICKETS)
    if (
      entry.requirements.some((requirement) =>
        ticket.prefixes.some((prefix) => requirement.startsWith(prefix)),
      )
    )
      return ticket;
  return undefined;
}

/** Classify one required case; render cases can only reach accepted via review. */
function stateOf(entry) {
  const result = results.get(entry.id);
  if (!result) return "missing";
  if (result.execution !== "executed")
    return result.error === "missing-implementation"
      ? "missing-implementation"
      : "blocked";
  if (result.semantic === "fail") return "semantic-fail";
  if (entry.kind === "render")
    return result.render === "accepted"
      ? "review-accepted"
      : result.render === "rejected"
        ? "review-rejected"
        : "pending-review";
  // Combined cases run through the same adapter and report a semantic verdict
  // whenever their assertions/observations matched; render cases only carry
  // pixels and are judged by review.
  if (result.semantic === "fail") return "semantic-fail";
  if (result.semantic !== "pass") return "semantic-missing";
  return "semantic-pass";
}

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
  const ticket = ticketOf(entry);
  if (ticket) groups.get(ticket.id).push(entry);
  else unassigned.push(entry);
}

const lines = [];
lines.push("# 支持矩阵覆盖对账");
lines.push("");
lines.push(
  "本文件由 `node scripts/acceptance-matrix.mjs <run.json>` 生成，登记一次真实采集的用例执行与评审状态。",
);
lines.push(
  "统计单位是支持矩阵派生出的必需用例目录（成员、重载、取值、来源、渲染入口与交互 ID），不是代码行覆盖率；任何数值都不能替代人工+AI 渲染对评审。",
);
lines.push("");
lines.push("## 运行");
lines.push("");
lines.push(`- 运行 ID：\`${run.runId}\``);
lines.push(`- commit：\`${run.commit}\`；dirty：\`${run.dirty}\``);
lines.push(`- 源快照：\`${run.sourceHash}\``);
lines.push(`- 环境：${run.environment.browser}；GPU：${run.environment.gpu}；DPR：${run.environment.dpr}`);
lines.push(`- 采集时间：${run.environment.date}`);
lines.push(
  `- 对账时工作区与运行一致：${source.commit === run.commit && source.sourceHash === run.sourceHash ? "是" : "否（运行已过期，需重新采集）"}`,
);
lines.push(`- 范围：\`${run.scope}\`（基础设施自检不能作为兼容验收）`);
lines.push("");
lines.push("## 状态词汇");
lines.push("");
lines.push(
  "`semantic-pass` 语义用例通过；`pending-review` 渲染用例已执行但缺人工+AI 评审；`missing-implementation` 必需用例没有可执行定义；`blocked` 未执行；`semantic-fail` 语义失败。",
);
lines.push("");

const order = [
  "semantic-pass",
  "pending-review",
  "review-accepted",
  "review-rejected",
  "semantic-fail",
  "blocked",
  "missing-implementation",
  "semantic-missing",
  "missing",
];

let total = 0;
const totals = new Map(order.map((state) => [state, 0]));
const renderPending = [];
const missing = [];
const failures = [];

for (const ticket of TICKETS) {
  const ticketEntries = groups.get(ticket.id);
  const counts = new Map(order.map((state) => [state, 0]));
  for (const entry of ticketEntries) {
    const state = stateOf(entry);
    counts.set(state, (counts.get(state) ?? 0) + 1);
    totals.set(state, (totals.get(state) ?? 0) + 1);
    total += 1;
    if (state === "pending-review") renderPending.push(entry.id);
    if (state === "missing-implementation" || state === "missing")
      missing.push(entry.id);
    if (state === "semantic-fail" || state === "review-rejected")
      failures.push(entry.id);
  }
  lines.push(`## ${ticket.label}（${ticket.id}）`);
  lines.push("");
  const extraHere = ticketEntries.filter((entry) => entry.extra).length;
  lines.push(
    `用例 ${ticketEntries.length} 个（矩阵必需 ${ticketEntries.length - extraHere}，额外 ${extraHere}）。`,
  );
  lines.push("");
  lines.push("| 状态 | 数量 |");
  lines.push("| --- | --- |");
  for (const state of order)
    if ((counts.get(state) ?? 0) > 0)
      lines.push(`| ${state} | ${counts.get(state)} |`);
  if (ticketEntries.length === 0) lines.push("| （无） | 0 |");
  lines.push("");
  const pending = ticketEntries
    .filter((entry) => stateOf(entry) === "pending-review");
  const pendingRequired = pending.filter((entry) => !entry.extra);
  if (pending.length) {
    lines.push(
      `待评审渲染用例 ${pending.length} 个（其中矩阵必需 ${pendingRequired.length} 个）：`,
    );
    lines.push("");
    for (const entry of pending)
      lines.push(`- \`${entry.id}\`${entry.extra ? "（额外证据）" : ""}`);
    lines.push("");
  }
  const missingHere = ticketEntries.filter((entry) => {
    const state = stateOf(entry);
    return state === "missing-implementation" || state === "missing";
  });
  if (missingHere.length) {
    lines.push("缺可执行定义：");
    lines.push("");
    for (const entry of missingHere) lines.push(`- \`${entry.id}\``);
    lines.push("");
  }
}

lines.push("## 合计");
lines.push("");
lines.push(`用例共 ${total} 个（矩阵必需 ${required.length}，额外 ${total - required.length}）。`);
lines.push("");
lines.push("| 状态 | 数量 |");
lines.push("| --- | --- |");
for (const state of order)
  if ((totals.get(state) ?? 0) > 0)
    lines.push(`| ${state} | ${totals.get(state)} |`);
lines.push("");
lines.push(
  `本运行不存在语义失败或评审拒绝：${failures.length === 0 ? "是" : "否"}`,
);
lines.push(`待评审渲染用例 ${renderPending.length} 个；缺定义 ${missing.length} 个。`);
lines.push("");
lines.push("## 排除项的显式错误检查");
lines.push("");
lines.push(
  "每个 `policy: unsupported` 成员都有 `context.<member>.contract` 用例，compat 侧断言 `unsupported-api` 且 message 含 API 名，native 侧断言调用本身合法。",
);
lines.push("");
lines.push("| 成员 | 必需用例 | 本次状态 |");
lines.push("| --- | --- | --- |");
for (const row of SUPPORT_MATRIX.filter((item) => item.policy === "unsupported")) {
  const id = `${row.id}.contract`;
  lines.push(`| \`${row.id}\` | \`${id}\` | ${stateOf({ id, kind: "semantic", requirements: [row.id] })} |`);
}
lines.push("");
if (unassigned.length) {
  lines.push("## 未归组的必需用例");
  lines.push("");
  for (const entry of unassigned) lines.push(`- \`${entry.id}\``);
  lines.push("");
}
lines.push("## 与代码覆盖率的边界");
lines.push("");
lines.push(
  "本对账只回答“矩阵中的每个成员、重载、取值、来源与交互是否被必需用例覆盖并如实执行”。它不测量源码行覆盖率，也不能把 `pending-review` 折算为通过；兼容结论仍需人工+AI 对同一运行的参考/兼容渲染对逐例评审。",
);
lines.push("");
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
