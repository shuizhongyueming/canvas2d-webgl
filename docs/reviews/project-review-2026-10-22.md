# 项目审核：PR #29 之后的首版实现

审核日期：2026-10-21 至 2026-10-22（Asia/Shanghai）。

## 结论与范围

**需要修正，当前不能宣布 Web 首版验收完成。** 主体实现已落地，但独立反例复现了 4 个运行缺陷；现有全量浏览器测试另有 4 项稳定失败，且仍有 161 个渲染用例待人工+AI评审。

用户确认的基线为 PR #29 合并提交 `9609549b2413194082f0d83f548cab111ee60024`；被审版本为 `25e31d899ccf69fde6f31c44cdcebdf0f39383dc`。比较命令为 `git diff 9609549...25e31d8`，24 个提交、177 个文件。排除 Biome 纯格式变化的干扰。执行测试时工作区干净。

审核采用独立的 Standards / Spec 两轴。依据为 `docs/specs/canvas2d-webgl.md`、`docs/development/contracts.md`、`docs/development/testing.md`、`docs/plans/development.md`、ADR-0001，以及 GitHub #9、#24、#26 的完成条件。以下不包含未经复现的猜测，也不把已经批准的 AA/裁剪差异重新列为缺陷。

## Standards

### S1 · P2：dispose 后部分 context 入口仍可使用

位置：`src/context/feature.ts:63`、`src/paint/feature.ts:53`；组装层 `src/context/context.ts` 未补统一检查。

规格 LIFE-01 要求“停止内部调度及兼容对象使用”；公开契约进一步要求“处置后拦截类 API 抛 code: 'disposed' 错误，直通类照常”（规格第 59 行）。

保存 context 后调用 `canvas.dispose()`，随后 `context.save()`、读写 `fillStyle`、`createLinearGradient()` 仍成功。独立真实浏览器复现确认：写入颜色后还能读回 `#ff0000`，还能创建新渐变。作为对照，`beginPath()` 与有效 `fillRect()` 正确抛出 `disposed`；但 `fillRect(NaN,0,10,10)` 又会提前返回。说明各入口的生命周期检查不一致。

建议统一拦截类 API 的处置检查，并覆盖属性读写、状态方法、paint 创建及提前 no-op 的调用。直通 DOM 能力仍按契约保留。现有 `lifecycle.dispose.twice` 只检查部分入口，不能覆盖此问题。

### S2 · P2：WebIDL 数字转换接受了包装 BigInt

位置：`src/paint/native-error.ts:41`。

工程契约要求受支持 API 的非法输入继续使用原生异常语义。`webidlDouble()` 仅拒绝原始 bigint，再调用 `Number(value)`；这会接受 `Object(1n)`，也会接受返回 bigint 的 `valueOf()`。

真实浏览器对照：`gradient.addColorStop(Object(1n), '#ff0000')` 在 compat 中成功，在原生 CanvasGradient 中抛 TypeError。此 helper 也被其他数字参数入口使用，修复时需检查全部消费者。

建议使用符合 ToNumber 的转换，并覆盖原始 BigInt、包装 BigInt、返回 BigInt 的对象及普通数字对象。rect/path 已使用一元 `+`；重复转换逻辑已经产生行为分叉。统一 helper 是维护建议，异常不一致是硬契约问题。

### S3 · P2：paint 缓存身份不能区分不同画布

位置：`src/paint/feature.ts:43`、`src/raster/rasterizer.ts:45`。

每个画布的 paint ID 都从相同起点递增，但全局品牌允许跨画布赋值。缓存只记录 `kind/id/version`，不能唯一确定实际 paint。这是缓存身份契约的缺口，与 Spec P2 为同一个缺陷，不重复计为两个运行缺陷。完整复现见下节。

## Spec

### P1 · P1：接管预绑定 WebGL 时未建立完整状态基线

位置：`src/gpu/device.ts:337`、`src/gpu/device.ts:347`。

CAN-01 明确允许“已按库期望 GL options 绑定 WebGL 上下文的画布”。目前只恢复部分 GL 状态，未规范化 culling、colorMask、blendEquation。

复现步骤：

1. 用库要求的 options 创建目标的 WebGL context。
2. 在包装前，分别设置 `CULL_FACE + FRONT_AND_BACK`、`colorMask(false,false,false,false)` 或 `blendEquation(FUNC_REVERSE_SUBTRACT)`。
3. 调用 `createCompatCanvas(target)`，然后用红色填充矩形。

三个独立变体都创建成功，但场景像素为 `[0,0,0,0]`；干净 context 对照为 `[255,0,0,255]`。包装后未从外部修改 GL，不违反 CAN-03 的独占使用规则。

建议在接管 context 时建立完整 GL 基线，并同时检查场景绘制和上屏路径。回归至少覆盖上述三个独立状态。

### P2 · P2：跨画布共享渐变会绘制旧颜色

位置：`src/paint/feature.ts:43`、`src/raster/rasterizer.ts:45`。

API-02 要求“受支持 API 的参数、状态、返回值和异常符合确认的原生语义”。公开支持集允许渐变作为 fillStyle，没有跨画布限制。

复现步骤：A、B 两个画布各创建第一个渐变，分别用两个色标定义纯红与纯蓝。A 在同一路径上先用 A 的红渐变填充，再用 B 的蓝渐变填充。两对象的局部 ID 和 version 相同。compat 第二次仍输出红色 `[255,0,0,255]`，原生对照输出蓝色 `[0,0,255,255]`。

建议让缓存键包含真实 paint 身份或跨实例唯一标识。不能只增加 version。相同缓存机制下的文字和 pattern 也应补回归；本次直接确认的是路径渐变。

### P3 · P1（交付门槛）：#24、#26 已关闭，但完成条件尚未满足

依据：[Issue #24](https://github.com/shuizhongyueming/canvas2d-webgl/issues/24)、[Issue #26](https://github.com/shuizhongyueming/canvas2d-webgl/issues/26)、`docs/plans/development.md:94`、`docs/acceptance/scenario-runs.md:495`。

#24 要求 ACC-01~05 全部必需用例执行、语义通过、人工+AI接受记录齐备，未决项为 0。已合并的 [PR #54](https://github.com/shuizhongyueming/canvas2d-webgl/pull/54) 自述仍有 161 项 pending-review；本次在当前提交重验，仍有 161 项待评审，并新增观察到 4 项测试失败。

#26 要求七场景截图对及完整评审。仓库记录明确说明七场景均未接受、缺双方评审、本次没有截图对，只有 SCN-07 的兼容侧单张截图；原运行 dirty，轨迹缓冲区在 200000 条处截断。因此不能据此完成像素评审，也不能把 0 个已记录错误推广为完整游戏调用面无错误。

建议重新开放验收票，或建立明确继承未完成条件的跟进票；在修复后从干净提交重新采集、补齐截图对和真实评审。当前文档如实标明未验收，这是正确做法；问题是 issue 完成状态与门槛不一致。本审核没有更改 GitHub 状态。

## 实际验证结果

| 检查 | 结果 |
| --- | --- |
| `pnpm run verify` | 类型检查、格式检查、构建与 281 项单测通过；0 fail / 0 skip |
| 全量真实浏览器采集 | 413 项 executed；302 semantic pass、107 render not-applicable、4 semantic fail；0 blocked |
| 正式 acceptance | `status: failed` / code 1；4 项失败，161 项 pending-review |
| 4 个失败用例单独重跑 | 全部稳定复现，差异字节数与全量运行相同 |
| 独立运行反例 | 预绑定 GL、跨画布渐变、dispose、包装 BigInt 四项均复现 |

环境：Chromium `156.0.8078.4`，ANGLE Vulkan / SwiftShader，DPR 1。使用显式 `--software`；不代表硬件 GPU 或 vivo 结论。首次在受限环境启动浏览器被操作系统拒绝，该次 blocked 记录没有计作功能结果；允许启动后完成了上述全量采集。

### 4 项现有测试失败

| 用例 | 首个失败检查 | 不一致字节数 |
| --- | --- | --- |
| `raster.gradient.draw-time-space` | gradient-fill-draw-transform | 2 |
| `raster.path-fill.geometry` | mixed-fill | 5 |
| `raster.path-stroke.geometry` | stroke-miter-reach | 3 |
| `raster.text.placement` | fillText:start/alphabetic | 492 |

这些用例在两种 adapter 中都执行内部 raster 与原生参考的比较，两边都触发同一断言。断言位于 `test/cases/raster/helpers.ts:205`。这不是两个 adapter 观测值不同，而是各自内部的逐字节相等检查失败。它们独立重跑仍失败，阻止验收；本次没有进一步认定根因是生产光栅算法、浏览器数值行为还是测试假设。应保留反例调查，不能直接增加容差、删除断言或改成通过。

当前 CI 运行 verify 和设施 smoke，没有运行完整特性矩阵。因此 CI 绿不能替代本表的全量结果。建议修复后将可自动执行的完整矩阵检查加入回归，仍把采集与人工像素验收分开。

## 证据位置与复现

以下本地证据位于临时目录，不保证长期保留；没有游戏源码或游戏资产。

- 全量 run：`/private/tmp/canvas-project-audit-20261021/f0673e97-77ef-4bb8-b4f7-882c252ad8e4/run.json`
- acceptance：`/private/tmp/canvas-project-audit-20261021/acceptance.json`
- 独立反例脚本：`/private/tmp/canvas2d-review-25e31d8/runtime-probes.mjs`
- 独立反例结果：`/private/tmp/canvas2d-review-25e31d8/runtime-probes-results.json`
- 四项单独重跑：`/private/tmp/canvas-project-audit-20261022-recheck/`，对应 run ID 为 `7d7bfd2e-3a85-41c9-9499-56ba56738925`、`a2368034-5bf6-4615-90c5-8b964be6c469`、`472bf89c-085f-4f9d-aa25-688c2fd444b8`、`9f173b15-a2a4-4b17-b9d1-6e59032ca1a7`。

复跑命令：

```sh
pnpm run verify
pnpm run test:browser --software --output /private/tmp/canvas-audit-new-run
pnpm run test:browser --software --output /private/tmp/canvas-audit-recheck --case raster.text.placement
node /private/tmp/canvas2d-review-25e31d8/runtime-probes.mjs
```

正式验收须使用采集时一致的干净源码。此审核报告是在测试结束后新增的未提交文件，会改变工作区 sourceHash；上述证据绑定的是报告新增前的干净 `25e31d8`，不是报告新增后的工作区。

## 边界

本次没有修改运行库、测试或 issue 状态，没有代填人工评审。矩形 AA（#43）、drawImage 插值/边缘（#49）、二值 stencil 裁剪边缘（#52）已有批准决策，不重复当作新缺陷。vivo #27 仍按原计划延后。部分接线指南仍使用“工厂/钩子尚未实现”等历史表述，应在交付整理时更新，但未列为运行缺陷。

Standards：3 项硬契约问题，最高 P2；Spec：3 项问题，最高 P1（预绑定 GL 失效及验收门槛未完成）。S3 与 P2 为同一缓存问题，两轴合计对应 4 个独立运行缺陷和 1 个交付门槛问题。
