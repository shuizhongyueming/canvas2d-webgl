# 七场景执行记录：Web 首版

执行票：[#26](https://github.com/shuizhongyueming/canvas2d-webgl/issues/26)。清单与格式依据 [scenarios.md](scenarios.md) / [evidence-format.md](evidence-format.md)，由 [#25](https://github.com/shuizhongyueming/canvas2d-webgl/issues/25) 落定。

本文件只记录**可复现的执行方式与结论边界**。运行产物（截图、API 轨迹、存档导出、采集器源码）按格式约定存放仓外，仓库仅以「日期 + 环境标识 + 游戏版本 + 库 commit」引用。

## 本次执行标识

| 字段 | 值 |
| --- | --- |
| 日期 | 2026-10-20 |
| 环境标识 | `ego-chromium156-swiftshader` |
| 游戏版本 | `unknown-epic-rage` 本地工作副本（`gc-2026/packages/unknown-epic-rage/src`） |
| 库 commit | `035ee8f` |
| 库 dirty | `false`（七场景采集前） |
| 浏览器 | Chromium 156.0.8078.4 |
| 渲染后端 | ANGLE SwiftShader（WebGL 1.0，stencil true，premultipliedAlpha true） |
| DPR | 2 |
| 游戏入口 | `index.html`（`src/` 经本地静态服务器） |
| 采集器 | 仓外注入脚本，标识 `26-probe/boot.js` |
| 注入方式 | CDP `Page.addScriptToEvaluateOnNewDocument`，导航前完成；`HTMLCanvasElement.prototype.getContext` 仅对 `#canvas` 转发到 `createCompatCanvas` |
| 证据位置 | 仓外 `/tmp/26-evidence/`（临时目录，验收结论引用本文件的执行标识） |

字体前置：`document.fonts` 预载 `Montserrat`（400/600/800），游戏自身在 `index.html` 完成，未改动。
存档前置：`localStorage["stickmanfuryv4"]`，本次为默认存档；SCN-05 通过 `setWeaponUnlockProgress(100)` 构造解锁分支。

## 结果总览

| 场景 | 执行 | 关键证据 | API 错误 |
| --- | --- | --- | --- |
| SCN-01 loading | executed | 启动段 60 条轨迹，首个 context 创建于 72.7 ms | 0 |
| SCN-02 战斗 / brightness | executed | `filter` setter 记录 `brightness(120%)` | 0 |
| SCN-03 customise / 动态源 | executed | `customiseTintCanvas`（249×356）作为外部源被重复 `drawImage` 最多 308 次 | 0 |
| SCN-04 结算-进度条 | executed | `gameState=levelComplete`，进度 25%，进度条动画完成 | 0 |
| SCN-05 结算-武器解锁 | executed | `stageCompleteIsUnlock=true`，进度 100%，结算按钮可见 | 0 |
| SCN-06 窗口缩放 | executed | canvas 1458×850 → 1335×850 → 1458×850，6 次尺寸 setter 全部记录 | 0 |
| SCN-07 上下文丢失/恢复 | executed | `onContextLost`（order 0）→ `onContextRestored`（order 1），恢复后继续绘制 | 0 |

七场景合计 **0 个 `unsupported-api`、0 个 `not-implemented`**。未触发矩阵外 API 的迹象。

## 每场景执行要点

### SCN-01 loading

- 步骤：启动静态服务器 → 注入采集器 → 打开 `index.html` → 采集首个 context 后的轨迹
- 观察：首帧轨迹成员为 `canvas.width/height`、`fillRect`、`fillStyle`、`fillText`、`font`、`textAlign`、`drawImage`、`save`/`restore`、`translate`、`rotate`
- 结论：loading 绘制路径完全落在首版支持集内

### SCN-02 战斗主场景 / brightness

- 步骤：等待 `gameState === "game"` → 将 `userInput.mouseX/Y` 置于 `panel.aButs` 各按钮中心 → 调用 `checkButtonsOver()`
- 观察：`filter` setter 记录 `brightness(120%)`，与 `app.js:808` 的悬停高亮事实一致
- 备注：合成 `pointermove` 事件不会触发 hover；游戏的 hover 判定读取 `userInput.mouseX/mouseY` 与 `aOverData` 矩形比对

### SCN-03 customise 换装 / 动态源分支 A

- 步骤：`openCustomise()` → `butEventHandler("colourSwatch5", {isDown:true})` → `butEventHandler("weaponSelect2", …)` → `butEventHandler("playFromCustomise", …)`
- 观察：`customiseTintCanvas` 尺寸 249×356；换色后同一外部 canvas 源被反复取样，单个源 id 最多 308 次 `drawImage`；当前场景 canvas 源绘制共 3925 次
- 结论：动态源分支 A（同一外部 canvas 每帧修改后被反复取样）真实可达

### SCN-04 / SCN-05 结算两种形态

- 步骤：作弊键 2 杀光敌人 → 推进 `checkLevelComplete()` 状态机进入 `levelComplete`；SCN-05 先 `setWeaponUnlockProgress(100)` 再 `initLevelComplete()` 触发解锁分支
- 观察：SCN-04 进度 25%、`stageCompleteIsUnlock=false`；SCN-05 进度 100%、`stageCompleteIsUnlock=true`、`stageCompleteButsVisible=true`

### SCN-06 窗口缩放

- 步骤：覆盖 `innerWidth/innerHeight` 为 1100×700 → `resizeCanvas()` → 恢复视口 → `resizeCanvas()`
- 观察：canvas 1458×850 → 1335×850 → 1458×850，`canvasScale` 同步变化，6 次 `canvas.width/height` setter 均进入轨迹
- 备注：ego-browser 下 CDP `Emulation.setDeviceMetricsOverride` 不触发页面 `resize` 事件，故按游戏的 `window.onresize` 路径直接调用 `resizeCanvas()`

### SCN-07 上下文丢失 / 恢复

- 步骤：取 `#canvas` 的 WebGL context → `getExtension("WEBGL_lose_context").loseContext()` → 等待 → `restoreContext()`
- 观察：`onContextLost` 与 `onContextRestored` 各一次且 order 连续；恢复后 `isContextLost() === false`，轨迹继续增长
- 结论：真实丢失/恢复路径可达，且恢复后继续渲染

## 结论边界（必须与下图一致）

- 本记录证明的是**场景可达性、API 轨迹覆盖与运行期错误面**，不是像素兼容结论。
- 场景参考/兼容渲染对的像素结论仍为 **pending-review**；按 [#7](https://github.com/shuizhongyueming/canvas2d-webgl/issues/7) 与 [evidence-format.md](evidence-format.md)，需人工+AI 对同一运行的渲染对逐例评审，工具自检与采集成功不冒充兼容验收。
- 本次未执行：vivo 真机（ACC-07，归平台票）；硬件 GPU（本次为 SwiftShader 软件渲染）。
- 环境限制：ego-browser 将 `requestAnimationFrame` 节流到约 1 fps，游戏动画推进依赖直接调用其状态机函数；该限制影响**推进方式**，不影响已记录的方法调用与错误面。

## 复现方式

1. 以 `~` 为根，静态服务器指向 `gc-2026/packages/unknown-epic-rage/src`，并把 `canvas2d-webgl/dist` 挂到 `/__compat/`。
2. 通过 CDP `Page.addScriptToEvaluateOnNewDocument` 注入采集器：`getContext("2d")` 对 `#canvas` 返回 `createCompatCanvas(canvas, { onContextLost, onContextRestored }).getContext("2d")`。
3. 打开 `index.html`，按上文每场景步骤操作。
4. 采集器输出 `window.__probe`（`trace`、`errors`、`lost`、`restored`、`phases`）。
