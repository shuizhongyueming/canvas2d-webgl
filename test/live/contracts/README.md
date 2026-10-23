# 实时渲染对比工具共同契约（issue #66）

本目录冻结后续目录（#67）、量测（#68）、执行（#69）、界面（#70）、协调（#71）票共同消费的内部 TypeScript 契约。修改本目录前必须先同步全部消费者。

## 模块归属

| 路径 | 所有者 | 说明 |
| --- | --- | --- |
| `test/live/contracts/` | 共同契约票（#66） | 消息、状态、像素、量测、反馈、视图事件与控制器状态类型 |
| `test/live/measure/` | 量测票（#68） | 浏览器/Node 共享的严格像素差分纯核心（本票仅桩） |
| `test/live/runner/` | 执行票（#69） | iframe 内子执行器、prepare/run/cleanup 与清理登记 |
| `test/live/controller/` | 协调票（#71） | 轮次生命周期、共同起跑、消息核对、本地服务协调 |
| `test/live/view/` | 界面票（#70） | 用例导航、分屏/重叠、背景、反馈面板 |
| `test/types/testing.ts` | 共同契约票（#66）扩展 | `CaseDefinition` 的可选展示分类与准备/清理扩展字段 |
| `scripts/build.mjs`、`tsconfig*.json`、`package.json` | 共同契约票（#66） | 工具构建入口与浏览器/Node 边界 |

## 边界

- 这些模块只属于测试工具；不得从 `src/` 公开入口或 package 导出。
- `test/live/**` 不得引入 Node 内置模块、pngjs 或文件系统依赖；Node 侧文件/PNG/hash 逻辑保留在 `scripts/`、`test/harness/`。
- 桩函数抛出 `not-implemented`，不得以假成功冒充功能。
- 旧 harness（`test/harness/browser.js`、driver、正式采集）语义不变；新工具通过共享用例定义与准备扩展复用，不形成第二套用例语义。
