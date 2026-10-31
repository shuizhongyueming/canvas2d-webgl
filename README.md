# canvas2d-webgl

为现有 Canvas 2D 游戏提供基于 WebGL 1 的兼容画布。运行库和浏览器用例采用 strict TypeScript。

**当前阶段：首版支持集已实现，实时渲染对比工具已交付；正式兼容性验收仍在收尾。** 本仓库尚未发布库包，`package.json` 当前设置为 `private: true`。

## 项目进度

以下状态核对于 2026-10-31，后续以关联 GitHub 票和对应提交的证据为准。

| 工作 | 当前状态 |
| --- | --- |
| 首版渲染器 | 状态与变换、矩形、图像、路径、文字、paint、裁剪、合成/filter、尺寸重置及生命周期已实现。具体支持值和限制见规格与支持矩阵。 |
| 实时渲染对比工具 | [开发计划已完成](https://github.com/shuizhongyueming/canvas2d-webgl/issues/65)。154 个展示用例自动执行完成，用户已逐项人工走查并确认无问题。 |
| CI | 检查类型、格式、单元/浏览器回归、设施冒烟和工具端到端流程。工具执行完成不等于正式像素兼容验收通过。 |
| 完整矩阵验收 | [仍待收尾](https://github.com/shuizhongyueming/canvas2d-webgl/issues/57)：在当前干净提交上采集、归档证据，补齐绑定该次运行的人工与 AI 评审，再通过 acceptance。 |
| 七场景验收 | [仍待收尾](https://github.com/shuizhongyueming/canvas2d-webgl/issues/58)：补齐参考/兼容截图对、完整轨迹和双方评审。 |
| 全量采集可重复性 | [设施抖动问题仍开放](https://github.com/shuizhongyueming/canvas2d-webgl/issues/59)。一次全量成功不代表已解决重复运行的稳定性。 |
| vivo 1200 | [延后验证](https://github.com/shuizhongyueming/canvas2d-webgl/issues/27)，等待调用方接入就绪。性能基准与优化也留待后续工作。 |

工具中的人工走查服务于实时观察和差异量测校准。它没有生成正式矩阵的 `reviews.json`，也没有替代七场景验收。原[首版开发计划](https://github.com/shuizhongyueming/canvas2d-webgl/issues/9)仍保留开放状态，跟踪这些未完成条件。

## 从源码开始

需要 Node.js >= 22 和 `package.json` 指定的 pnpm 版本。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
```

公开入口为 `dist/index.js`，公开声明由源码生成到 `dist/index.d.ts`。以下为浏览器 ESM 示例；通过本地 HTTP 服务提供这些文件：

```ts
import { createCompatCanvas } from "./dist/index.js";

const target = document.createElement("canvas");
target.width = 640;
target.height = 360;
document.body.append(target);

const canvas = createCompatCanvas(target);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#2463eb";
ctx.fillRect(20, 20, 120, 80);
// 当前任务的绘制在微任务提交点自动上屏。

// 不再使用时：canvas.dispose();
```

目标画布承载 WebGL 显示。调用方通过返回对象的 `getContext("2d")` 绘制。在没有 `document` 的运行环境中，须传入 `createOffscreenCanvas(width, height)` 工厂，为内部光栅化创建独立的原生 2D 画布。平台接入及能力要求见[工程契约](docs/development/contracts.md)。

## 实时对比网页

```sh
pnpm run test:live
# 可选：指定端口和准备/运行时限，单位为毫秒
pnpm run test:live -- --port=4173 --prepare-timeout=10000 --run-timeout=10000
```

命令自动构建，服务仅绑定 `127.0.0.1`。默认选择空闲端口，以终端打印的地址为准。按 `Ctrl+C` 停止。

网页支持下拉、上一项/下一项及 ↑/↓ 选择用例，支持分屏/重叠按钮和 V 键切换。可调整重叠透明度、背景与显示比例，查看最终像素读回差异及差异图，并复制用例 ID 或反馈上下文。两侧实时独立运行，切换和重跑会清理旧执行环境。

程序不调用 AI、不保存人工意见、不自动判断像素是否可接受。浏览器指纹保护可能扰动像素读回，严格差异不直接等于渲染缺陷。详见[工具规格](docs/specs/live-render-comparison.md)和[测试指南](docs/development/testing.md)。

## 支持范围与架构

- 主画面保存在 WebGL 场景纹理中，按微任务提交上屏。
- 路径与文字借助内部原生离屏 2D 光栅化为素材，再由 WebGL 合成。性能需要在真实工作负载中另外评估。
- 外部原生 canvas 作为 `drawImage` 来源时，每次读取其当前内容，保持调用顺序。图像来源要求同源或满足 CORS；首版排除兼容画布作为图像源。
- 这是限定支持集。合成模式、filter、线型、文字布局等有明确限制；以[规格](docs/specs/canvas2d-webgl.md)、[支持矩阵](src/contracts/support.ts)和[公开类型](src/api.ts)为准。

架构依据见[FBO 与原生光栅化分工](docs/adr/0001-fbo-scene-texture-native-rasterization.md)。

## 验证与正式验收

先安装测试浏览器。Linux 环境使用 `pnpm exec playwright install --with-deps chromium`。

```sh
pnpm exec playwright install chromium
pnpm run verify
pnpm run test:smoke --software
pnpm run test:live:e2e
```

`verify` 包含真实浏览器回归，需要可启动的 Chromium。`--software` 明确选择 SwiftShader，不代表硬件 GPU 或 vivo 验证。工具端到端证据写入被忽略的 `test-results/live-tool/`。

正式全量采集、报告与 acceptance 是另一条证据流程，命令和状态含义见[测试指南](docs/development/testing.md)。正式 acceptance 要求干净源码、完整目录及有效的逐用例人工与 AI 评审；`pending-review`、采集成功或 CI 通过均不能替代它。真实游戏证据要求见[场景验收](docs/acceptance/README.md)。

## 文档入口

- [Agent 文档索引](llms.txt)：按任务选择需要阅读的源码和文档。
- [库规格](docs/specs/canvas2d-webgl.md)与[规格管理票](https://github.com/shuizhongyueming/canvas2d-webgl/issues/1)。
- [工程契约](docs/development/contracts.md)：公开接口、内部边界与协作要求。
- [测试指南](docs/development/testing.md)：运行、用例、产物和评审流程。
- [GitHub 管理约定](docs/issue-tracker.md)：决策、实施票及关闭门槛。
- [术语表](GLOSSARY.md)。
- [历史设计访谈](docs/design/grill.md)与[可行性研究](docs/research/canvas2d-webgl-feasibility.md)：查看决策依据时使用，当前范围以规格及其后续决议为准。
