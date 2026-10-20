# 场景验收：清单、证据格式与环境模板

落地票：[实施：七场景步骤与仓外证据格式](https://github.com/shuizhongyueming/canvas2d-webgl/issues/25)。执行票：[验收：Web 七场景与首版证据汇总](https://github.com/shuizhongyueming/canvas2d-webgl/issues/26)（首版实现完成后由验收 agent 按本目录执行并产出仓外证据）。

依据：

- [决策：样例游戏场景与运行时覆盖证据 #8](https://github.com/shuizhongyueming/canvas2d-webgl/issues/8)：七场景清单、事实基础、十三项子决策（本目录将其落成可执行清单与格式）。
- [决策：差分区域分类、误差指标与容差校准 #7](https://github.com/shuizhongyueming/canvas2d-webgl/issues/7)：量化阈值落地前以人工+AI 一致性评审为准。
- [决策：首批目标平台与最低运行时版本 #6](https://github.com/shuizhongyueming/canvas2d-webgl/issues/6)：本目录仅覆盖 Web（Chromium 系）；vivo 真机场景验收延后。
- [规格](../specs/canvas2d-webgl.md) ACC-06 行、[工程契约](../development/contracts.md) 与[测试设施](../development/testing.md) 的状态词汇。

## 内容

| 文件 | 作用 |
| --- | --- |
| [scenarios.md](scenarios.md) | 七场景验收清单：每场景的入口、操作序列、等待条件、字体/存档/作弊键前置、brightness 与动态源证据点，以及执行时机与待核验项汇总。 |
| [evidence-format.md](evidence-format.md) | 证据格式定义：场景运行记录、API 轨迹条目、已触发/未触发/矩阵外对账报告、人工+AI 评审记录、判定规则与仓外引用方式。 |
| [environment-template.md](environment-template.md) | 环境记录模板：浏览器、GPU、DPR、字体、存档预设、采集器等复现信息的必填字段。 |
| [matrix-reconciliation.md](matrix-reconciliation.md) | 支持矩阵覆盖对账口径：必需用例目录、按前置票分组、状态词汇与 `test:matrix` 生成方式。 |

## 边界（不可违反）

- 公开仓库只保存清单、格式定义与环境模板。运行记录（截图、轨迹、目检与评审结论、存档导出）保存在仓库之外，以「日期 + 环境标识 + 游戏版本 + 库 commit」引用；游戏源码与资源不复制进公开仓库（#8 决策 1）。
- API 轨迹采集器作为测试工具从页面外部注入，只包装兼容画布公开 API 面；不修改游戏任何文件。采集器与运行产物同样仓外存放，仅其格式定义入仓（#8 决策 11）。
- 可重复 = 精确人工步骤脚本（入口、操作序列、等待条件、存档前置、环境记录）；不要求自动化输入回放，不承诺锁定随机种子（#8 决策 2）。游戏 `Math.random` 无种子机制，只记录该事实与每次执行的随机差异说明。
- 未实际运行的步骤与未确认的前置值一律标「待核验」，执行时以真实观察改写；禁止编造已验证前置值。
- 像素一致性遵守 #7：不定量化阈值前以人工+AI 目检结论占位；不自设容差、不用全图均值判通过、不把 skip/pending-review 折算成通过。
- 场景验收只证明「实际使用 ⊆ 首版支持集」与动态源分支真实可达且可评审；最终像素兼容结论需人工+AI 对真实渲染对的评审，工具自检、纯语义或采集成功不冒充兼容验收。

## 与其他测试层的关系

场景验收对应规格 ACC-06。支持集内未被游戏触发的成员由 ACC-02/03 单元/组合差分用例兜底，不据此缩减 #4 矩阵（#8 决策 4）。运行时命中矩阵外 API 是验收失败信号，须另建决策票，不静默扩展支持集。两层共用 #7 的判定办法与[术语](../../GLOSSARY.md)（场景验收、运行时轨迹、未触发路径、一致性评审）。
