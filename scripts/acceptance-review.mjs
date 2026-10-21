import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { decode } from "../test/harness/evidence.mjs";
import {
  injectionPoints,
  isolatedInjection,
  measurePair,
} from "./review-index.mjs";

/**
 * Build the review packet for one collected run: one row per pixel-bearing
 * case with the measured difference, plus the isolated-error counterexample
 * that proves the locator does not hide local mistakes.
 *
 * Usage: node scripts/acceptance-review.mjs <run.json> [--out <file.md>]
 */
const args = process.argv.slice(2);
const runPath = args.find((value) => !value.startsWith("--"));
if (!runPath) {
  console.error("usage: acceptance-review <run.json> [--out <file.md>]");
  process.exitCode = 1;
  process.exit();
}
const outIndex = args.indexOf("--out");
const runFile = resolve(runPath);
const outPath =
  outIndex >= 0
    ? resolve(args[outIndex + 1])
    : join(dirname(runFile), "review-index.md");
const run = JSON.parse(await readFile(runFile, "utf8"));
const directory = dirname(runFile);

/** Per-case measurement over the scene pair; the display pair is separate evidence. */
async function measure(result) {
  const read = async (key) =>
    decode(await readFile(join(directory, result.artifacts[key])));
  return measurePair(await read("reference"), await read("actual"));
}

const rows = [];
for (const result of run.results) {
  if (result.kind === "semantic" || !result.artifacts) continue;
  rows.push({ result, ...(await measure(result)) });
}
rows.sort((a, b) => b.changed - a.changed);

const pending = rows.filter((row) => row.result.render !== "accepted");
const identical = rows.filter((row) => row.changed === 0);
const roundingOnly = rows.filter(
  (row) => row.changed > 0 && row.maxDelta <= 2 && row.edgeFlips === 0,
).length;

/**
 * Isolated-error counterexample: change one channel unit in up to four pixels
 * of a real artifact and require the locator to report exactly those pixels at
 * exactly those coordinates. This proves the diff tooling is not hiding local
 * errors; it is not tolerance calibration and does not accept any case.
 */
const sample = identical[0] ?? rows[0];
let counterexample;
if (sample) {
  const reference = decode(
    await readFile(join(directory, sample.result.artifacts.reference)),
  );
  const actual = decode(
    await readFile(join(directory, sample.result.artifacts.actual)),
  );
  const injection = isolatedInjection(
    reference,
    actual,
    injectionPoints(actual.width, actual.height),
  );
  counterexample = { caseId: sample.result.caseId, ...injection };
}

const lines = [];
const push = (...values) => lines.push(...values);
push(
  "# 真实渲染对评审索引",
  "",
  `运行：\`${run.runId}\`；commit \`${run.commit}\`；dirty \`${run.dirty}\`；环境 ${run.environment.browser} / ${run.environment.gpu}。`,
  "",
  "本索引由 `node scripts/acceptance-review.mjs <run.json>` 生成，只汇总已采集产物；它不记录评审结论，也不改变任何用例状态。参考图、兼容图、差异图与显示面截图在同一运行目录下，按 fixture 的约定人工+AI 共同评审。",
  "",
  "## 总览",
  "",
  `- 像素用例：${rows.length}`,
  `- 场景逐像素一致：${identical.length}`,
  `- 存在差异：${rows.length - identical.length}`,
  `- 待人工+AI 评审：${pending.length}`,
  "",
  "差异列的口径：`像素数` 为任一通道不同的像素；`最大通道差` 是这些像素上的最大绝对差；`边缘翻转` 统计一方完全透明、另一方不完全透明的像素；`低 alpha 差` 统计两侧 alpha 相同且小于 32 的差异像素。它们只用于定位与归因，不是容差门槛。",
  "",
  `其中 ${roundingOnly} 个用例的最大通道差不超过 2 且没有边缘翻转；这个分类仅帮助阅读，评审仍须逐图确认。`,
  "",
  "## 逐用例",
  "",
  "| 用例 | 类型 | 评审状态 | 像素数 | 最大通道差 | 边缘翻转 | 低 alpha 差 | 包围框 |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
);
for (const row of rows) {
  const box = row.bounds
    ? `${row.bounds.x},${row.bounds.y} ${row.bounds.width}x${row.bounds.height}`
    : "—";
  push(
    `| \`${row.result.caseId}\` | ${row.result.kind} | ${row.result.render} | ${row.changed} | ${row.maxDelta} | ${row.edgeFlips} | ${row.lowAlphaDeltas} | ${box} |`,
  );
}
push(
  "",
  "## 局部错误检测反例",
  "",
  counterexample
    ? [
        `在 \`${counterexample.caseId}\` 的真实兼容产物上，把 ${counterexample.injected} 个像素各改动 1 个通道单位。`,
        `定位器报告 ${counterexample.reported} 个差异像素，位置 ${JSON.stringify(counterexample.located)}，`,
        `与注入点 ${JSON.stringify(counterexample.expected)} ${counterexample.exact ? "完全一致" : "不一致"}。`,
        "该反例说明工具不会把局部错误平均掉；它不是容差校准，也不代表任何用例已通过。",
      ].join("")
    : "本次运行没有可用于注入反例的像素产物。",
  "",
  "## 评审须知",
  "",
  "- 逐用例判定必须同时有人类与 AI 记录，绑定 runId/commit/sourceHash/environmentHash/artifactHash；本文件不是评审记录。",
  "- 差异归因（8 位舍入、抗锯齿覆盖、缩放重采样、裁剪硬边）只帮助阅读图像，不能替代逐图目检。",
  "- 全图均值或差异像素数不作通过门槛。",
  "",
);

const markdown = lines.join("\n");
await writeFile(outPath, markdown, "utf8");
console.log(
  JSON.stringify({
    out: outPath,
    pixelCases: rows.length,
    identical: identical.length,
    changed: rows.length - identical.length,
    roundingOnly,
    pending: pending.length,
    counterexample: counterexample
      ? { caseId: counterexample.caseId, exact: counterexample.exact }
      : null,
  }),
);
