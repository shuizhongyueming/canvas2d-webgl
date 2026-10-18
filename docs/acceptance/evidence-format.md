# 场景验收证据格式

落地票：[#25](https://github.com/shuizhongyueming/canvas2d-webgl/issues/25)。消费票：[#26](https://github.com/shuizhongyueming/canvas2d-webgl/issues/26)。格式依据 [#8](https://github.com/shuizhongyueming/canvas2d-webgl/issues/8) 决策 1/3/4/7/11 与[#7](https://github.com/shuizhongyueming/canvas2d-webgl/issues/7) 判定办法；状态词汇与[工程契约](../development/contracts.md)、[测试设施](../development/testing.md) 对齐。

本文件只定义格式与判定规则。所有实际记录（截图、轨迹、评审结论、存档导出）仓外存放，不入公开仓库。

## 存放与引用

- 证据实体建议布局：`<证据根>/<日期>/<环境标识>/<场景id>/`，由执行方维护，仓库不约束其内部结构。
- 仓库与票据中只引用四元组：`日期 + 环境标识 + 游戏版本 + 库 commit`，外加仓外位置说明；不复制任何游戏资源、截图、轨迹或存档入仓（#8 决策 1）。
- 采集器与注入脚本同样仓外（#8 决策 11）；场景记录只登记其标识/版本与注入方式描述。

## 成员标识与参数签名

- 轨迹成员使用支持矩阵 id（`src/contracts/support.ts` 的 `SUPPORT_MATRIX`，如 `context.drawImage`、`canvas.width`、`gradient.addColorStop`）。矩阵外成员以原始名称记录并进入矩阵外清单。
- 方法记录**参数签名**：参数个数 + 关键取值类别。例如 `drawImage` 记录 3/5/9 参与源种类（`HTMLImageElement` / `native-canvas`）；`clip` 记录是否带 `evenodd`。
- 属性 setter 记录**观察到的取值**：枚举值原样记录（如 `globalCompositeOperation=source-atop`、`filter=brightness(120%)`、`filter=none`）；连续值记录取值类别（如 `fillStyle` 的 hex/rgba 字符串、gradient、pattern；`globalAlpha` 的有限数值）。
- 只记录兼容画布公开 API 面的方法调用与属性 setter（#8 决策 3）。游戏自建离屏 canvas 的内部原生调用不逐一计数，其正确性由动态源场景差分截图证明。

## 场景运行记录（ScenarioRun）

每场景每次执行一条记录。字段：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `schemaVersion` | `1` | 格式版本 |
| `scenarioId` | string | `SCN-01`…`SCN-07`，见 [scenarios.md](scenarios.md) |
| `date` | string | 执行日期（YYYY-MM-DD） |
| `operator` | string | 执行人/agent 标识 |
| `execution` | `"executed" \| "blocked" \| "not-run"` | 与设施层 `CaseResult.execution` 同义；`blocked` 必须填 `blockedReason`；不得折算为通过 |
| `blockedReason` | string? | 阻塞原因（环境、素材、前置不可达等） |
| `environment` | object | 按 [environment-template.md](environment-template.md) 的完整记录（内嵌），或以 `environmentId` + 环境记录哈希引用 |
| `game` | object | 游戏标识与版本/commit，记录实际值 |
| `library` | object | 被测库 `commit` 与 `dirty` 状态 |
| `collector` | object | 采集器标识/版本与注入方式（仓外工具） |
| `savePreset` | object \| null | `{ "key": "stickmanfuryv4", "value": <原样记录>, "appliedVia": "cheat-key-3" \| "devtools" }`；无预设记 `null` 并说明初始存档状态 |
| `cheatKeysUsed` | string[] | 本场景实际使用的作弊键及目的 |
| `stepsExecuted` | string[] | 实际执行的步骤与观察（含实际进入路径、实际等待到的条件）；与清单偏差须注明 |
| `randomness` | object | `{ "fact": <随机源事实>, "runNotes": <本次观察到的随机差异说明> }`；fact 固定记录「`Math.random` 无种子机制（#8 事实：静态 135 处）」，不填种子、不承诺回放 |
| `apiTrace` | TraceEntry[] | 本场景轨迹，见下 |
| `unsupportedApiHits` | object[] | 显式不支持桩触发记录 `{ "member", "code", "context" }`；任何未报告的 unsupported 触发使场景不得判通过 |
| `outOfMatrixHits` | object[] | 矩阵外可观察交互 `{ "name", "kind", "context" }`；存在即验收失败信号，见判定规则 |
| `evidencePoints` | object | `{ "brightness": { "observed", "filterValues", "artifactRefs" }, "dynamicSources": [{ "branch": "A" \| "B", "sourceDescription", "artifactRefs" }] }`；场景未覆盖的点记 `observed: false` 而非省略 |
| `artifacts` | object[] | `{ "kind": "screenshot-pair" \| "trace" \| "other", "ref": <仓外位置或内容哈希> }` |
| `review` | object | 见「评审记录」 |
| `verdict` | `"accepted" \| "not-accepted"` | 派生结论，规则见「判定规则」；不手工填写 |

TraceEntry：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `member` | string | 矩阵成员 id；矩阵外成员为原始名称 |
| `kind` | `"method-call" \| "property-set"` | 方法调用与 setter 分别记录 |
| `signature` | string | 参数签名或观察到的取值（见上节约定） |
| `count` | number | 本场景内出现次数 |

## 评审记录（review）

与设施层 `ReviewRecord` 同构：人工与 AI 分别记录，AI 不得代填人工结论。

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `review.status` | `"pending-review" \| "accepted" \| "rejected"` | 像素一致性评审状态；`pending-review` 不得折算通过 |
| `review.human` | object \| null | `{ "reviewer", "date", "verdict": "accepted" \| "rejected" }`；未评审为 `null` |
| `review.ai` | object \| null | `{ "reviewer", "date", "verdict", "notes" }` |
| `review.artifactHash` | string | 绑定被评截图对内容，防止记录漂移 |

评审对象为同场景参考/兼容渲染对。#7 量化阈值落地前以目检结论占位；不自设容差、不用全图均值判通过。

## 判定规则

场景 `verdict = "accepted"` 当且仅当全部成立（#8 决策 7）：

1. `execution = "executed"` 且 `apiTrace` 已记录；
2. 无未报告的 `unsupportedApiHits`（凡触发必记录并被评审知悉）；
3. `review.status = "accepted"`（人工与 AI 均 accepted）。

`execution = "blocked" / "not-run"` 或 `review.status = "pending-review"` 一律判 `"not-accepted"` 并附原因；不得把 skip/pending 折算成通过。

`outOfMatrixHits` 非空是**验收失败信号**（#8 决策 4）：每条须新建决策票并在对账报告中关联票号；不得静默扩展支持集。

## 对账报告（CoverageReport）

一次验收执行完全部场景后产出一份，与静态矩阵对账（#8 决策 3/4）：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `schemaVersion` | `1` | 格式版本 |
| `runId` | string | 本次验收执行标识（日期 + 环境标识） |
| `date` / `environmentRef` / `game` / `library` | — | 同 ScenarioRun |
| `scenarios` | object[] | 七场景各自的 `scenarioId`、`execution`、`review.status`、`verdict` 汇总 |
| `triggered` | object[] | 矩阵内已触发成员：`{ "member", "scenarios": [场景id...], "totalCount" }` |
| `untriggered` | object[] | 支持集内全部场景均未触发的成员：`{ "member", "fallback": { "layer": "ACC-02" \| "ACC-03", "evidenceRef": <单元差分证据引用> } }`。未触发不缩减 #4 矩阵；缺兜底证据的成员如实标注 |
| `outOfMatrix` | object[] | 矩阵外触发：`{ "name", "scenarioId", "decisionIssue": <决策票号> }` |
| `overall` | `"accepted" \| "not-accepted"` | 仅当七场景全部 `accepted` 且无未决矩阵外项时为 `accepted`；其余一律 `not-accepted` 并附原因清单 |

## 与设施层词汇对照

| 场景层 | 设施层（`CaseResult` / testing.md） |
| --- | --- |
| `execution: executed/blocked/not-run` | `execution` 同义 |
| `review.status: pending-review/accepted/rejected` | `render` 同义；同样必须人工+AI 双方记录 |
| `unsupportedApiHits` / `outOfMatrixHits` | 场景层特有，来源于运行时轨迹 |
| 不设 `semantic` 字段 | 场景层不做逐条语义断言；语义正确性由 ACC-01~05 单元/组合层承担 |

## 骨架示例（仅示意结构；`<待填>` 与数值均为占位符，非实测数据）

```json
{
  "schemaVersion": 1,
  "scenarioId": "SCN-04",
  "date": "<待填>",
  "operator": "<待填>",
  "execution": "executed",
  "environment": { "environmentId": "<待填>" },
  "game": { "id": "unknown-epic-rage", "version": "<待填>" },
  "library": { "commit": "<待填>", "dirty": false },
  "collector": { "id": "<待填>", "version": "<待填>", "injection": "<待填：页面外部注入方式>" },
  "savePreset": { "key": "stickmanfuryv4", "value": "<待填：原样记录>", "appliedVia": "devtools" },
  "cheatKeysUsed": ["3: 重置存档", "2: 杀光敌人进入结算"],
  "stepsExecuted": ["<待填：实际步骤与观察>"],
  "randomness": {
    "fact": "Math.random 无种子机制（#8 事实：静态 135 处），不锁种子、不承诺回放",
    "runNotes": "<待填：本次随机差异说明>"
  },
  "apiTrace": [
    { "member": "context.drawImage", "kind": "method-call", "signature": "9 args, source=native-canvas", "count": 0 },
    { "member": "context.filter", "kind": "property-set", "signature": "brightness(120%)", "count": 0 }
  ],
  "unsupportedApiHits": [],
  "outOfMatrixHits": [],
  "evidencePoints": {
    "brightness": { "observed": false, "filterValues": [], "artifactRefs": [] },
    "dynamicSources": [{ "branch": "B", "sourceDescription": "<待填>", "artifactRefs": [] }]
  },
  "artifacts": [{ "kind": "screenshot-pair", "ref": "<待填：仓外位置或哈希>" }],
  "review": { "status": "pending-review", "human": null, "ai": null, "artifactHash": "<待填>" },
  "verdict": "not-accepted"
}
```
