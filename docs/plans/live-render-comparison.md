# 本地实时渲染对比工具开发计划

GitHub 主入口：[开发计划：本地实时渲染对比工具与多 agent 并行交付](https://github.com/shuizhongyueming/canvas2d-webgl/issues/65)。

## 目标

交付仓库内可启动的 TypeScript 实时渲染对比工具，支持直观用例选择、双 iframe 实时运行、分屏/重叠、严格像素读回差异及反馈复制。此计划是开发入口，不重开已经完成的决策地图。

## 权威输入

- [产品规格](https://github.com/shuizhongyueming/canvas2d-webgl/issues/60)
- [展示目录决议](https://github.com/shuizhongyueming/canvas2d-webgl/issues/62)
- [执行与清理决议](https://github.com/shuizhongyueming/canvas2d-webgl/issues/63)
- [量测与反馈决议](https://github.com/shuizhongyueming/canvas2d-webgl/issues/64)

## 共同交付规则

新增工具逻辑使用 TypeScript，不扩大库公开 API。先合并共同契约，再并行开发。每票在独立 codex/ 分支及 worktree 开工，认领并评论分支/目录；只领取无开放 blocker 且未认领的票。依赖代表前置 PR 已合并。开始与集成时重新核对 main，不依赖聊天中的旧用例数量。

每张票包含实现和自身测试，不把全部测试推给集成票。PR 记录命令、结果和未完成项；运行 pnpm run verify 与相关浏览器检查。PR 合并、该票要求的评审和验证齐备后才关闭。不得自行降低已批准行为；发现规格反例应先提决策 blocker。

本工具不签署正式验收、不生成 reviews.json、不自动通过/拒绝、不调用 AI、不缓存历史、不做暂停慢放、不扩完整矩阵 CI。与既有验收跟进和设施抖动票相邻，但不替代它们。

## 接口与文件所有权

共同契约票冻结内部类型、模块路径及构建方案。后续票不得各建另一套消息或指标模型。契约修改先同步所有消费者。目录票负责展示元信息及 catalog；执行票负责 prepare/run/cleanup 和用例资源准备；两票可能同改 .case.ts，合并冲突由后合并方按字段归属解决，不覆盖另一票内容。package.json、构建与 tsconfig 首先归共同契约票，后续命令调整归集成票。UI 与协调器分别持有 view 与 controller 文件，不交叉实现。

## 完成门槛

从干净 checkout 安装依赖后，可用文档中的单一命令构建并启动本地工具。所有候选明确分类，合格用例不静默遗漏。资源确实销毁而不仅拒收旧结果。严格指标与共享 Node 核心一致，隐私噪声限制明确。实际浏览器覆盖交互与异常流程，并由用户完成代表用例人工走查。完成开发工具不等于兼容库矩阵/七场景验收通过。

## 开发票与依赖

| 开发票 | 前置合并 |
| --- | --- |
| [工具基础：冻结内部契约、构建入口与模块归属](https://github.com/shuizhongyueming/canvas2d-webgl/issues/66) | 无，可先领取 |
| [工具目录：逐项展示分类与目录漂移检查](https://github.com/shuizhongyueming/canvas2d-webgl/issues/67) | [工具基础：冻结内部契约、构建入口与模块归属](https://github.com/shuizhongyueming/canvas2d-webgl/issues/66) |
| [工具量测：共享严格差分核心与反馈序列化](https://github.com/shuizhongyueming/canvas2d-webgl/issues/68) | [工具基础：冻结内部契约、构建入口与模块归属](https://github.com/shuizhongyueming/canvas2d-webgl/issues/66) |
| [工具执行：双路可复用准备运行与资源清理](https://github.com/shuizhongyueming/canvas2d-webgl/issues/69) | [工具基础：冻结内部契约、构建入口与模块归属](https://github.com/shuizhongyueming/canvas2d-webgl/issues/66) |
| [工具界面：用例导航、实时分屏重叠与反馈面板](https://github.com/shuizhongyueming/canvas2d-webgl/issues/70) | [工具基础：冻结内部契约、构建入口与模块归属](https://github.com/shuizhongyueming/canvas2d-webgl/issues/66) |
| [工具协调：iframe 生命周期、共同起跑与本地服务](https://github.com/shuizhongyueming/canvas2d-webgl/issues/71) | [工具基础：冻结内部契约、构建入口与模块归属](https://github.com/shuizhongyueming/canvas2d-webgl/issues/66)、[工具执行：双路可复用准备运行与资源清理](https://github.com/shuizhongyueming/canvas2d-webgl/issues/69)、[工具目录：逐项展示分类与目录漂移检查](https://github.com/shuizhongyueming/canvas2d-webgl/issues/67) |
| [工具交付：端到端接线、回归证据与人工走查](https://github.com/shuizhongyueming/canvas2d-webgl/issues/72) | [工具目录：逐项展示分类与目录漂移检查](https://github.com/shuizhongyueming/canvas2d-webgl/issues/67)、[工具量测：共享严格差分核心与反馈序列化](https://github.com/shuizhongyueming/canvas2d-webgl/issues/68)、[工具执行：双路可复用准备运行与资源清理](https://github.com/shuizhongyueming/canvas2d-webgl/issues/69)、[工具界面：用例导航、实时分屏重叠与反馈面板](https://github.com/shuizhongyueming/canvas2d-webgl/issues/70)、[工具协调：iframe 生命周期、共同起跑与本地服务](https://github.com/shuizhongyueming/canvas2d-webgl/issues/71) |

## 并发顺序

共同契约先行。合并后，目录、量测、执行、界面四条线可并行。协调器在目录和执行合并后开始，可与尚在进行的量测/界面并行。最后集成并完成用户走查。全部依赖已建立 GitHub 原生关系；建票时不预先认领开发票。
