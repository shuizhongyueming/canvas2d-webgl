# 支持矩阵覆盖对账

落地票：[验收：完整 API 矩阵与跨特性组合回归](https://github.com/shuizhongyueming/canvas2d-webgl/issues/24)。依据：[规格](../../docs/specs/canvas2d-webgl.md) ACC-01~05、[工程契约](../development/contracts.md)的支持矩阵与必需用例目录、[测试设施](../development/testing.md)。

本目录只定义对账口径与生成方式。每次执行的具体数字属于该次采集产物，存放在被忽略的 `test-results/` 下并由 PR 引用 run ID，不入仓；否则提交报告本身就会改变源快照，使对应运行立即过期。

## 对账单位

统计单位是 `src/contracts/support.ts` 的 `SUPPORT_MATRIX` 派生出的必需用例目录，加上 `test/cases/manifest/index.ts` 声明的交互用例 ID：

- 每个成员一条 `contract`；
- 每个批准重载一条 `arity-N`；
- 每个支持取值一条 `value-…`；
- 每个批准图像来源一条 `source-…`；
- 绘制入口的 `render` 用例；
- 跨特性交互 ID（`CAN-04`、`CAN-05`、`IMG-02`、`IMG-03`、`ACC-03`、`ACC-04`、`LIFE-01`~`03`）。

这不是代码行覆盖率。行覆盖率不能证明某个矩阵取值被像素证据覆盖，也不能把待评审渲染对折算为通过。

## 按前置票分组

脚本把每条用例归到负责该成员的前置实施票：

| 前置票 | 负责矩阵 owner / 交互前缀 |
| --- | --- |
| #17 矩形三方法 | `rect`、`CAN-04`、`CAN-05` |
| #18 drawImage 重载与外部 canvas 顺序 | `image`、`IMG-02`、`IMG-03`、`ACC-04` |
| #19 公开路径填充描边及 paint 集成 | `path` |
| #20 文字光栅化、布局与 width 测量 | `text` |
| #21 模板裁剪、evenodd 与状态恢复 | `clip` |
| #22 操作级合成模式与 brightness | `composite` |
| #23 尺寸重置、dispose 与上下文恢复 | `lifecycle`、`LIFE-01`~`03`、`ACC-05` |
| #24 跨特性组合（本票） | `ACC-03` 及本票新增用例 |
| 更早的工程/画布/状态/paint 票 | `canvas`、`state`、`paint`、`gpu`、`context`、`CAN-01`~`03`、`ACC-01` |

## 状态词汇

与测试设施一致，不从代码覆盖或采集成功推导：

| 状态 | 含义 |
| --- | --- |
| `semantic-pass` | 语义用例双端执行且观测一致 |
| `pending-review` | 渲染用例已执行，缺人工+AI 评审（不折算为通过） |
| `review-accepted` / `review-rejected` | 人工+AI 记录齐备后的结论 |
| `semantic-fail` | 语义观测或断言不一致 |
| `blocked` | 未执行（环境、skip、未实现） |
| `missing-implementation` | 必需用例没有可执行定义 |
| `semantic-missing` | 已执行但没有语义结论 |

额外证据（特性票或本票自行增加的用例）与矩阵必需用例分开计数，避免把额外用例当成矩阵覆盖。

## 生成

```sh
pnpm run test:browser --output test-results/24-acceptance
pnpm run test:matrix --run test-results/24-acceptance/<runId>/run.json --out test-results/24-acceptance/<runId>/matrix.md
```

`test:matrix` 在缺定义或存在语义失败时退出 1；待评审属于预期未完成状态，不改变退出码，也不会被写成通过。脚本只读运行产物，不重新采集、不重新判定评审。

## 渲染对评审索引

```sh
pnpm run test:review-index --run <run.json> --out <run目录>/review-index.md
```

索引逐用例列出差异像素数、最大通道差、边缘翻转、低 alpha 差与包围框，并在一个真实产物上做局部错误检测反例：改动几个像素各一个通道单位，要求定位器报出同样的坐标数。统计列只帮助阅读，不构成容差；索引不写评审结论，也不改变任何用例状态。评审记录仍按 `reviews.template.json` 填写后交给 `test:acceptance`。

## 排除项

矩阵中每个 `policy: unsupported` 成员都有 `context.<member>.contract`，compat 侧断言错误 code 为 `unsupported-api` 且 message 含 API 名，native 侧断言同一调用在原生语义下合法。`scrollPathIntoView` 在当前 Chromium 未暴露，用例把这一平台事实记为 `absent`，不会被当成排除语义通过。

## 边界

- 对账只证明覆盖与执行事实。像素兼容结论需要人工+AI 对同一运行的参考/兼容渲染对逐例评审（[#7](https://github.com/shuizhongyueming/canvas2d-webgl/issues/7)）。
- 不设容差、不用全图均值判通过；差异像素数只用于定位。
- 该对账不等同七场景验收（ACC-06）或 vivo 真机结果（ACC-07）。
