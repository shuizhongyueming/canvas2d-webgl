# PR 29 审查报告处置

日期：2026-10-18。依据本地 `pr-29-browser-harness-review.md` 对 080d081 的审查；原报告保留为历史证据，不改写审查者结论。

| 意见 | 处置 |
| --- | --- |
| S1 / P2 | --reviews 明确可选；省略时仍 pending-review / exit 2，统一契约表。 |
| A1 | 异常前绘制红色矩形；实际读取 reference / actual PNG，检查红色区与透明区。 |
| A2 | actual 页面增加 4×3 品红 DOM overlay，scene 差异必须 0，display 差异必须 12，并检查两张显示图颜色，防止接反。 |
| A3 | dirty 或未声明 dirty 的 run 不可验收；开发采集仍允许 dirty，提交后须重新采集及评审。 |
| S3 | collect、report、acceptance 共用 requiredCases；默认自检集与指定故障用例合并，partial skip 不再产生目录不一致噪声。 |
| S5 | 删除无人调用的 __harnessCleanup；页面隔离 context 由 driver.close 释放。 |
| S7 | 写产物前验证输出目录：仓内必须是忽略的 test-results，解析符号链接，仓外允许。 |
| P1 | HTML 展示导入评审记录的身份、日期、verdict、notes；旧记录仍显示但不变成有效评审，HTML 转义有回归。 |
| P3 | 在指南明确当前是独立探针证据；真实 target 属性/尺寸/stencil 核验留给 GPU/facade 接线。本 PR 不宣称 compat 渲染验收。 |
| P4 | 文档明确 executed 仅表示尝试执行；协议没有 failed execution。产物/尺寸错误沿用 semantic fail + error / exit 1，不改为环境 blocked。 |
| A4 | PR 描述随最终提交与 CI 证据更新，旧 run 不作为新提交证据。 |

S2 / P5 的环境分类方向合理，但不能把所有未列出的契约异常一概归 blocked：context-attributes-mismatch 可能是工厂传错配置，initialization-failed 可能是实现缺陷。当前未识别错误保持 fail-closed，避免把真实缺陷降为环境问题；在 GPU/facade 实现真实失败来源后按具体阶段完善映射及测试。现有测试专用 code：harness-blocked（字体、skip、等待超时），test-hooks-unavailable（私有钩子未接入）；现有库级 blocked：not-implemented、webgl-unavailable、capability-unavailable。其余 code 及原生异常按失败保留。

S4 的统一产物 key 和 S6 的 execute 职责拆分是有效的可维护性建议，暂不在本轮扩大重构；固定六张产物仍由端到端自检和验收测试约束。CI 归属纠正 C1 同意，属于原先指定职责。

以上为测试设施审查处置，不是人工像素评审，不代表生产渲染器、七场景或 vivo 验收。
