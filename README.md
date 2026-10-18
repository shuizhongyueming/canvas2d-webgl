# canvas2d-webgl

面向现有 Canvas 2D 游戏的 WebGL 兼容画布项目。

**当前阶段：工程契约已完成，真实浏览器测试设施已落地；渲染器尚未实现。** 后续按 GitHub 实施票及依赖分配多个 agent。

## 规格与记录

- [开发计划与实施子票](https://github.com/shuizhongyueming/canvas2d-webgl/issues/9)：领取入口和原生依赖。
- [实施计划文档](docs/plans/development.md)：接口分工、文件归属、测试与合并门槛。
- [规格快照](docs/specs/canvas2d-webgl.md)：功能边界、验收要求、待决策项。
- [Spec issue](https://github.com/shuizhongyueming/canvas2d-webgl/issues/1) 与 [Wayfinder 决策地图](https://github.com/shuizhongyueming/canvas2d-webgl/issues/2)。
- [GitHub 管理约定](docs/issue-tracker.md)：决策票、依赖和规格同步方式。
- [设计访谈](docs/design/grill.md)：已确认输入与修正历史。
- [术语表](GLOSSARY.md)。
- [可行性报告](docs/research/canvas2d-webgl-feasibility.md)与[现成方案核验](docs/research/existing-canvas2d-webgl.md)：历史研究，不能视为已实现能力；与最新确认不一致时以规格为准。

## 已确认方向

- 接受未绑定或已按期望 GL options 绑定 WebGL 上下文的目标画布，以 WebGL 1 为最低基线，返回通过 `getContext('2d')` 使用的兼容对象。
- 主场景使用 WebGL；原生离屏工厂只供库内部辅助绘制使用，不接管游戏自行创建的 canvas。
- 外部原生 canvas 作为图像源时保守刷新并保持调用顺序；首版排除兼容画布作为图像源。
- 语义与像素差分并行，每次同环境实时生成原生参考；先由人工配合 AI 评审实测渲染对，量化阈值待评审证据积累后另定。
- 性能基准和优化延后；首批 Web（Chromium）和 vivo 1200，vivo 真机验证延后至调用方接入就绪，不宣称已兼容。

先完成工程契约与测试设施，再并行推进状态、GPU、路径素材和样式；连通矩形端到端链路后展开特性实现，最后汇合组合回归及场景验收。详见开发计划。

## 测试设施

运行、用例接入与人工/AI评审见[真实浏览器测试指南](docs/development/testing.md)。`pnpm run test:smoke` 只验证设施，不代表兼容渲染通过。

实现语言采用 **TypeScript（strict）**。公开类型从源码生成；后续 agent 使用 `src/**/*.ts` 和 `*.case.ts`，以 `pnpm run verify` 与 `pnpm run test:smoke -- --software` 验证。
