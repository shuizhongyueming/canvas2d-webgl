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

## TypeScript 迁移复审（基线 e823385）

依据本地 `pr-29-typescript-refactor-review.md`，原报告不改写。

| 意见 | 处置 |
| --- | --- |
| R1 | report 写入入口复用 validateOutput，拒绝仓内源码、dist、.build 等目录；回归确认拒绝后无 report.html。 |
| R2 | HTML 区分 dirty、clean、unknown；只有 dirty 严格等于 false 才显示 clean，缺失值继续阻塞验收。 |
| R3 | build 检查 dist 与 .build/test 的所有 JS，覆盖静态、动态和副作用 import，以及 re-export；新增拒绝 Node/裸包依赖的回归。此守卫不是完整 JavaScript 解析器或安全沙箱。 |
| R5 | 明确 strict TS 覆盖运行时、共享契约和浏览器用例，Node 工具保留 JS；删除遗留“JS 形状”描述。 |
| R6 | 通用 hash/provenance 移到 scripts，build 不再依赖 harness 或 pngjs；补充构建配置及生成类型消费测试的所有权。 |
| R7（部分） | 补充 .build 产物修改拒绝测试，以及 dirty/unknown HTML 回归；注入坐标尚未抽取共享常量。 |

R4（临时 .case.ts 发现/编译/加载全链路自动回归）、R8（评审身份独立性约束）、N1（未构建时静态 import 的错误提示）、N2（测试元数据类型归属）保留为非阻塞跟进项。本轮未实现，不计为关闭。人工与 AI 身份仍由流程保证，字段校验不提供身份认证。

验证：类型检查、构建和 29 项单测通过；提交后的 Chromium 软件 WebGL 自检另见 PR 验证记录。以上仍不是 compat 像素验收。
