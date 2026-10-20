# 七场景执行记录：Web 首版

执行票：[#26](https://github.com/shuizhongyueming/canvas2d-webgl/issues/26)。清单与格式依据 [scenarios.md](scenarios.md) 与 [evidence-format.md](evidence-format.md)，由 [#25](https://github.com/shuizhongyueming/canvas2d-webgl/issues/25) 落定。

本文件只记录**可复现的执行方式与结论边界**。运行产物（截图、API 轨迹、存档导出、采集器源码）按格式约定存放仓外，仓库仅以「日期 + 环境标识 + 游戏版本 + 库 commit」引用。

> **本次执行为一次性证据**：产物位于临时目录 `/tmp/26-evidence/`，不保证长期可读。下表 `artifacts` 中的 `ref` 记录当时路径与内容哈希，供当下核对；长期归档需另行迁移到常驻仓外位置。

## 执行标识

| 字段 | 值 |
| --- | --- |
| `schemaVersion` | 1 |
| `runId` | `2026-10-20-ego-chromium154-metal` |
| `date` | 2026-10-20 |
| `operator` | `kimi-code-agent`（自动化执行；人工评审记录见 `review.human = null`） |
| `library.commit` | `035ee8f` |
| `library.dirty` | `true`（原因：主 checkout 存在既有未跟踪目录 `.pnpm-store/`，不影响源码） |
| `library.sourceHash` | `4bc0a08a3ebc66c78aa2aa9613dbffa21a6fd2d4baab034fb089d0999ba8d58b`（含上述未跟踪目录，故与 `dirty` 一并记录） |
| `game` | `unknown-epic-rage`，本地工作副本（`gc-2026/packages/unknown-epic-rage/src`），**无 commit，版本待核验** |
| `collector` | `26-probe/boot.js`（仓外工具），经 CDP `Page.addScriptToEvaluateOnNewDocument` 在导航前注入；`HTMLCanvasElement.prototype.getContext` 仅对 `#canvas` 转发 |

## 环境（`environment`）

| 字段 | 值 |
| --- | --- |
| `browser` | ego-browser 内置 Chromium `154.0.8037.44`（评审在 ego Framework 二进制中佐证）；UA 因 UA reduction 显示为 `Chrome/154.0.0.0` |
| `platform` | `MacIntel` |
| `timezone` | `Asia/Shanghai` |
| `dpr` | 2 |
| `glVersion` | `WebGL 1.0 (OpenGL ES 2.0 Chromium)` |
| `glVendor` | `Google Inc. (Apple)` |
| `glRenderer` | `ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)` |
| `glAttributes` | `{alpha:true, antialias:true, depth:true, stencil:true, premultipliedAlpha:true, preserveDrawingBuffer:false, powerPreference:"default", desynchronized:false}` |
| `canvasSize` | CSS `1728×1007`；物理 `1458×850`（首次进入战斗后） |
| `fonts` | `document.fonts.check('400 16px "Montserrat"')=true`、`600`=true、`800`=true；`document.fonts.status = "loaded"` |

**更正说明**：此前草稿写「Chromium 156 / SwiftShader」有误。实测 UA 为 Chrome 154、渲染器为 ANGLE Metal（Apple M1 Pro 硬件后端），非 SwiftShader 软件渲染。以本表为准。

## 结果总览

| 场景 | `execution` | `review.status` | 关键证据 | `unsupportedApiHits` |
| --- | --- | --- | --- | --- |
| SCN-01 loading | executed | pending-review | 启动段 60 条轨迹，首个 context 创建于 72.7 ms | `[]` |
| SCN-02 战斗 / brightness | executed | pending-review | `filter` setter 记录 `brightness(120%)` | `[]` |
| SCN-03 customise / 动态源 | executed | pending-review | `customiseTintCanvas` 249×356，单源重复 `drawImage` 最多 308 次 | `[]` |
| SCN-04 结算-进度条 | executed | pending-review | `gameState=levelComplete`，进度 25% | `[]` |
| SCN-05 结算-武器解锁 | executed | pending-review | `stageCompleteIsUnlock=true`，进度 100% | `[]` |
| SCN-06 窗口缩放 | executed | pending-review | 1458×850 → 1335×850 → 1458×850，6 次尺寸 setter | `[]` |
| SCN-07 上下文丢失/恢复 | executed | pending-review | `onContextLost`→`onContextRestored`，恢复后继续绘制 | `[]` |

七场景 `verdict` 均为 `not-accepted`（派生规则：`review.status=pending-review`）。

**关于「0 个 unsupported-api / 0 个 not-implemented」**：这是**观察面**的结论——在采集器上限内（200000 条，统计时已满）的轨迹中未出现这两类错误。它既不等于「支持矩阵全部成员已被验证」，也不等于「整场游戏的全部调用都无错误」；矩阵覆盖由 `test:matrix`（#24）与 ACC-01~05 单元/组合层承担，见下文 `untriggered`。

## 场景运行记录（ScenarioRun）

以下每条对应一次执行。`apiTrace` 给出该场景的代表性成员与签名；**逐条完整轨迹在仓外**，且采集器有 200000 条上限（会话结束统计时已达上限，见下文对账报告的说明）。SCN-04/05/07 的逐成员计数未按场景切分，标为「见全量聚合」而非编造具体数字。

### SCN-01 loading

```json
{
  "schemaVersion": 1,
  "scenarioId": "SCN-01",
  "runId": "2026-10-20-ego-chromium154-metal",
  "date": "2026-10-20",
  "operator": "kimi-code-agent",
  "execution": "executed",
  "savePreset": null,
  "cheatKeysUsed": [],
  "stepsExecuted": [
    "启动本地静态服务器指向游戏 src/，并将库 dist 挂到 /__compat/",
    "CDP addScriptToEvaluateOnNewDocument 注入采集器后导航到 index.html",
    "等待 __probe 出现首个轨迹条目",
    "记录首 context 创建时刻与启动段成员"
  ],
  "notifications": [],
  "randomness": { "fact": "Math.random 无种子机制（#8 事实：静态 135 处）", "runNotes": "本次未观察到需要说明的随机差异" },
  "apiTrace": [
    { "member": "canvas.width", "kind": "property-set", "signature": "number", "count": null, "countNote": "启动段共 60 条轨迹，逐成员计数未单独记录" },
    { "member": "canvas.height", "kind": "property-set", "signature": "number", "count": null, "countNote": "同上" },
    { "member": "context.drawImage", "kind": "method-call", "signature": "3/5/9-arg; HTMLImageElement", "count": null, "countNote": "同上" },
    { "member": "context.fillRect", "kind": "method-call", "signature": "4-arg", "count": null, "countNote": "同上" },
    { "member": "context.fillStyle", "kind": "property-set", "signature": "string:hex/rgba", "count": null, "countNote": "同上" },
    { "member": "context.fillText", "kind": "method-call", "signature": "3-arg", "count": null, "countNote": "同上" },
    { "member": "context.font", "kind": "property-set", "signature": "string", "count": null, "countNote": "同上" },
    { "member": "context.save", "kind": "method-call", "signature": "0-arg", "count": null, "countNote": "同上" },
    { "member": "context.restore", "kind": "method-call", "signature": "0-arg", "count": null, "countNote": "同上" },
    { "member": "context.translate", "kind": "method-call", "signature": "2-arg", "count": null, "countNote": "同上" },
    { "member": "context.rotate", "kind": "method-call", "signature": "1-arg", "count": null, "countNote": "同上" },
    { "member": "context.textAlign", "kind": "property-set", "signature": "string:center", "count": null, "countNote": "同上" }
  ],
  "unsupportedApiHits": [],
  "outOfMatrixHits": [],
  "evidencePoints": {
    "brightness": { "observed": false, "filterValues": [], "artifactRefs": [] },
    "dynamicSources": []
  },
  "artifacts": [
    { "kind": "trace", "ref": "/tmp/26-evidence/scenario-runs.json#/scenarios/SCN-01" }
  ],
  "review": {
    "runId": "2026-10-20-ego-chromium154-metal",
    "scenarioId": "SCN-01",
    "commit": "035ee8f",
    "sourceHash": "4bc0a08a3ebc66c78aa2aa9613dbffa21a6fd2d4baab034fb089d0999ba8d58b",
    "environmentHash": "待核验",
    "artifactHash": "待核验",
    "human": null,
    "ai": null,
    "status": "pending-review"
  },
  "verdict": "not-accepted"
}
```

### SCN-02 战斗主场景 / brightness

```json
{
  "schemaVersion": 1,
  "scenarioId": "SCN-02",
  "runId": "2026-10-20-ego-chromium154-metal",
  "date": "2026-10-20",
  "operator": "kimi-code-agent",
  "execution": "executed",
  "savePreset": null,
  "cheatKeysUsed": [],
  "stepsExecuted": [
    "等待 gameState === 'game'",
    "将 userInput.mouseX/Y 置为 panel.aButs 各按钮中心",
    "调用 checkButtonsOver() 触发 hover 判定",
    "观察 filter setter 记录"
  ],
  "notifications": [],
  "randomness": { "fact": "Math.random 无种子机制（#8 事实：静态 135 处）", "runNotes": "敌人行为由无种子随机驱动；本场景只验证 hover 的 filter 路径，未做逐帧断言" },
  "apiTrace": [
    { "member": "context.filter", "kind": "property-set", "signature": "string:brightness(120%)", "count": 2 },
    { "member": "context.globalAlpha", "kind": "property-set", "signature": "number:1", "count": null, "countNote": "未逐次计数" },
    { "member": "context.drawImage", "kind": "method-call", "signature": "9-arg; HTMLCanvasElement", "count": null, "countNote": "未逐次计数" },
    { "member": "context.save", "kind": "method-call", "signature": "0-arg", "count": null, "countNote": "未逐次计数" },
    { "member": "context.restore", "kind": "method-call", "signature": "0-arg", "count": null, "countNote": "未逐次计数" }
  ],
  "unsupportedApiHits": [],
  "outOfMatrixHits": [],
  "evidencePoints": {
    "brightness": { "observed": true, "filterValues": ["brightness(120%)"], "artifactRefs": [] },
    "dynamicSources": []
  },
  "artifacts": [
    { "kind": "trace", "ref": "/tmp/26-evidence/scenario-runs.json#/scenarios/SCN-02" }
  ],
  "review": {
    "runId": "2026-10-20-ego-chromium154-metal",
    "scenarioId": "SCN-02",
    "commit": "035ee8f",
    "sourceHash": "4bc0a08a3ebc66c78aa2aa9613dbffa21a6fd2d4baab034fb089d0999ba8d58b",
    "environmentHash": "待核验",
    "artifactHash": "待核验",
    "human": null,
    "ai": null,
    "status": "pending-review"
  },
  "verdict": "not-accepted"
}
```

### SCN-03 customise 换装 / 动态源分支 A

```json
{
  "schemaVersion": 1,
  "scenarioId": "SCN-03",
  "runId": "2026-10-20-ego-chromium154-metal",
  "date": "2026-10-20",
  "operator": "kimi-code-agent",
  "execution": "executed",
  "savePreset": null,
  "cheatKeysUsed": [],
  "stepsExecuted": [
    "调用 openCustomise() 进入换装界面",
    "butEventHandler('colourSwatch5', {isDown:true}) 换色",
    "butEventHandler('weaponSelect2', {isDown:true}) 换武器",
    "butEventHandler('playFromCustomise', {isDown:true}) 返回战斗",
    "统计外部 canvas 源被重复取样次数"
  ],
  "notifications": [],
  "randomness": { "fact": "Math.random 无种子机制（#8 事实：静态 135 处）", "runNotes": "换装预览动画受无种子随机影响，未做逐帧断言" },
  "apiTrace": [
    { "member": "context.drawImage", "kind": "method-call", "signature": "5-arg; native-canvas", "count": 3925, "sourceRef": "tint-canvas-A", "countNote": "canvas 源调用总数；单个源 id 最多重复 308 次" },
    { "member": "context.clearRect", "kind": "method-call", "signature": "4-arg", "count": null, "countNote": "已观察到，未逐次计数" },
    { "member": "context.globalCompositeOperation", "kind": "property-set", "signature": "string:source-atop", "count": null, "countNote": "已观察到，未逐次计数" }
  ],
  "unsupportedApiHits": [],
  "outOfMatrixHits": [],
  "evidencePoints": {
    "brightness": { "observed": false, "filterValues": [], "artifactRefs": [] },
    "dynamicSources": [
      { "branch": "A", "sourceDescription": "customiseTintCanvas 249×356；同一外部 canvas 每帧 clearRect+source-atop 重染后被反复取样，单源最多 308 次", "artifactRefs": [] }
    ]
  },
  "artifacts": [
    { "kind": "trace", "ref": "/tmp/26-evidence/scenario-runs.json#/scenarios/SCN-03" },
    { "kind": "screenshot-pair", "ref": "未生成（本次只采集 API 轨迹，未做截图对）" }
  ],
  "review": {
    "runId": "2026-10-20-ego-chromium154-metal",
    "scenarioId": "SCN-03",
    "commit": "035ee8f",
    "sourceHash": "4bc0a08a3ebc66c78aa2aa9613dbffa21a6fd2d4baab034fb089d0999ba8d58b",
    "environmentHash": "待核验",
    "artifactHash": "待核验",
    "human": null,
    "ai": null,
    "status": "pending-review"
  },
  "verdict": "not-accepted"
}
```

### SCN-04 结算-进度条形态

```json
{
  "schemaVersion": 1,
  "scenarioId": "SCN-04",
  "runId": "2026-10-20-ego-chromium154-metal",
  "date": "2026-10-20",
  "operator": "kimi-code-agent",
  "execution": "executed",
  "savePreset": null,
  "cheatKeysUsed": ["2：杀光敌人以进入结算"],
  "stepsExecuted": [
    "作弊键 2 杀光当前关卡敌人",
    "存档为默认值（savePreset: null）；步骤中未写入预设",
    "推进 checkLevelComplete() 状态机（rAF 被节流，直接调用）",
    "观察 gameState 变为 levelComplete、进度条目标 25%"
  ],
  "notifications": [],
  "randomness": { "fact": "Math.random 无种子机制（#8 事实：静态 135 处）", "runNotes": "庆祝文字键从 congratsKeys 随机选取，本次未记录具体值" },
  "apiTrace": [
    { "member": "context.fillRect", "kind": "method-call", "signature": "4-arg（结算遮罩与进度条）", "count": null, "countNote": "未按场景切分计数" },
    { "member": "context.font", "kind": "property-set", "signature": "string（结算文字）", "count": null, "countNote": "未按场景切分计数" },
    { "member": "context.fillText", "kind": "method-call", "signature": "3-arg（进度百分比文字）", "count": null, "countNote": "未按场景切分计数" }
  ],
  "unsupportedApiHits": [],
  "outOfMatrixHits": [],
  "evidencePoints": {
    "brightness": { "observed": false, "filterValues": [], "artifactRefs": [] },
    "dynamicSources": []
  },
  "artifacts": [
    { "kind": "trace", "ref": "/tmp/26-evidence/scenario-runs.json#/scenarios/SCN-04" },
    { "kind": "screenshot-pair", "ref": "未生成（本次只采集状态与轨迹）" }
  ],
  "review": {
    "runId": "2026-10-20-ego-chromium154-metal",
    "scenarioId": "SCN-04",
    "commit": "035ee8f",
    "sourceHash": "4bc0a08a3ebc66c78aa2aa9613dbffa21a6fd2d4baab034fb089d0999ba8d58b",
    "environmentHash": "待核验",
    "artifactHash": "待核验",
    "human": null,
    "ai": null,
    "status": "pending-review"
  },
  "verdict": "not-accepted"
}
```

### SCN-05 结算-武器解锁形态

```json
{
  "schemaVersion": 1,
  "scenarioId": "SCN-05",
  "runId": "2026-10-20-ego-chromium154-metal",
  "date": "2026-10-20",
  "operator": "kimi-code-agent",
  "execution": "executed",
  "savePreset": null,
  "cheatKeysUsed": ["2：杀光敌人以进入结算"],
  "stepsExecuted": [
    "存档为默认值（savePreset: null）",
    "setWeaponUnlockProgress(100) 构造解锁分支前置（非自然进度累积）",
    "initLevelComplete() 进入结算",
    "推进 stageCompleteTimer 至动画完成",
    "观察 stageCompleteIsUnlock=true、stageCompleteButsVisible=true"
  ],
  "notifications": [],
  "randomness": { "fact": "Math.random 无种子机制（#8 事实：静态 135 处）", "runNotes": "解锁粒子效果由无种子随机驱动，未做逐帧断言" },
  "apiTrace": [
    { "member": "context.fillRect", "kind": "method-call", "signature": "4-arg（解锁版遮罩）", "count": null, "countNote": "未按场景切分计数" },
    { "member": "context.drawImage", "kind": "method-call", "signature": "9-arg; HTMLImageElement（武器图标）", "count": null, "countNote": "未按场景切分计数" }
  ],
  "unsupportedApiHits": [],
  "outOfMatrixHits": [],
  "evidencePoints": {
    "brightness": { "observed": false, "filterValues": [], "artifactRefs": [] },
    "dynamicSources": []
  },
  "artifacts": [
    { "kind": "trace", "ref": "/tmp/26-evidence/scenario-runs.json#/scenarios/SCN-05" },
    { "kind": "screenshot-pair", "ref": "未生成（本次只采集状态与轨迹）" }
  ],
  "review": {
    "runId": "2026-10-20-ego-chromium154-metal",
    "scenarioId": "SCN-05",
    "commit": "035ee8f",
    "sourceHash": "4bc0a08a3ebc66c78aa2aa9613dbffa21a6fd2d4baab034fb089d0999ba8d58b",
    "environmentHash": "待核验",
    "artifactHash": "待核验",
    "human": null,
    "ai": null,
    "status": "pending-review"
  },
  "verdict": "not-accepted"
}
```

### SCN-06 窗口缩放

```json
{
  "schemaVersion": 1,
  "scenarioId": "SCN-06",
  "runId": "2026-10-20-ego-chromium154-metal",
  "date": "2026-10-20",
  "operator": "kimi-code-agent",
  "execution": "executed",
  "savePreset": null,
  "cheatKeysUsed": [],
  "stepsExecuted": [
    "覆盖 innerWidth/innerHeight 为 1100×700（ego-browser 下 CDP metrics override 不触发页面 resize 事件）",
    "调用 resizeCanvas()（与游戏 window.onresize 处理路径一致）",
    "恢复视口为 1728×1007 并再次 resizeCanvas()",
    "核对 canvas 尺寸链与 canvasScale"
  ],
  "notifications": [],
  "randomness": { "fact": "Math.random 无种子机制（#8 事实：静态 135 处）", "runNotes": "缩放过程未观察到随机差异" },
  "apiTrace": [
    { "member": "canvas.width", "kind": "property-set", "signature": "number:1335.7142857142858 / 1728 / 1458.5898709036744", "count": 3, "countNote": "两次 resizeCanvas 合计；含恢复步骤" },
    { "member": "canvas.height", "kind": "property-set", "signature": "number:850 / 1007 / 850", "count": 3, "countNote": "同上" }
  ],
  "unsupportedApiHits": [],
  "outOfMatrixHits": [],
  "evidencePoints": {
    "brightness": { "observed": false, "filterValues": [], "artifactRefs": [] },
    "dynamicSources": []
  },
  "artifacts": [
    { "kind": "trace", "ref": "/tmp/26-evidence/scenario-runs.json#/scenarios/SCN-06" }
  ],
  "review": {
    "runId": "2026-10-20-ego-chromium154-metal",
    "scenarioId": "SCN-06",
    "commit": "035ee8f",
    "sourceHash": "4bc0a08a3ebc66c78aa2aa9613dbffa21a6fd2d4baab034fb089d0999ba8d58b",
    "environmentHash": "待核验",
    "artifactHash": "待核验",
    "human": null,
    "ai": null,
    "status": "pending-review"
  },
  "verdict": "not-accepted"
}
```

### SCN-07 上下文丢失 / 恢复

```json
{
  "schemaVersion": 1,
  "scenarioId": "SCN-07",
  "runId": "2026-10-20-ego-chromium154-metal",
  "date": "2026-10-20",
  "operator": "kimi-code-agent",
  "execution": "executed",
  "savePreset": null,
  "cheatKeysUsed": [],
  "stepsExecuted": [
    "取 #canvas 的 WebGL context 与 WEBGL_lose_context 扩展",
    "loseContext() 触发真实丢失",
    "restoreContext() 触发恢复",
    "观察回调顺序与恢复后绘制"
  ],
  "notifications": [
    { "name": "onContextLost", "order": 0, "time": 40117.7 },
    { "name": "onContextRestored", "order": 1, "time": 41657.7 }
  ],
  "randomness": { "fact": "Math.random 无种子机制（#8 事实：静态 135 处）", "runNotes": "恢复后场景内容由无种子随机驱动，只验证继续绘制" },
  "apiTrace": [
    { "member": "context.fillRect", "kind": "method-call", "signature": "4-arg（恢复后重绘）", "count": null, "countNote": "未按场景切分计数" }
  ],
  "unsupportedApiHits": [],
  "outOfMatrixHits": [],
  "evidencePoints": {
    "brightness": { "observed": false, "filterValues": [], "artifactRefs": [] },
    "dynamicSources": []
  },
  "artifacts": [
    { "kind": "trace", "ref": "/tmp/26-evidence/scenario-runs.json#/scenarios/SCN-07" },
    { "kind": "screenshot-pair", "ref": "/tmp/26-evidence/scn07-after-restore.png（仅兼容侧单张，27355 B）" }
  ],
  "review": {
    "runId": "2026-10-20-ego-chromium154-metal",
    "scenarioId": "SCN-07",
    "commit": "035ee8f",
    "sourceHash": "4bc0a08a3ebc66c78aa2aa9613dbffa21a6fd2d4baab034fb089d0999ba8d58b",
    "environmentHash": "待核验",
    "artifactHash": "待核验",
    "human": null,
    "ai": null,
    "status": "pending-review"
  },
  "verdict": "not-accepted"
}
```

## 对账报告（CoverageReport）

```json
{
  "schemaVersion": 1,
  "runId": "2026-10-20-ego-chromium154-metal",
  "date": "2026-10-20",
  "environmentId": "ego-chromium154-metal",
  "environmentRef": "见上文「环境」表（哈希待核验）",
  "game": "unknown-epic-rage 本地工作副本（无 commit，待核验）",
  "library": { "commit": "035ee8f", "dirty": true, "sourceHash": "4bc0a08a3ebc66c78aa2aa9613dbffa21a6fd2d4baab034fb089d0999ba8d58b" },
  "scenarios": [
    { "scenarioId": "SCN-01", "execution": "executed", "review": "pending-review", "verdict": "not-accepted" },
    { "scenarioId": "SCN-02", "execution": "executed", "review": "pending-review", "verdict": "not-accepted" },
    { "scenarioId": "SCN-03", "execution": "executed", "review": "pending-review", "verdict": "not-accepted" },
    { "scenarioId": "SCN-04", "execution": "executed", "review": "pending-review", "verdict": "not-accepted" },
    { "scenarioId": "SCN-05", "execution": "executed", "review": "pending-review", "verdict": "not-accepted" },
    { "scenarioId": "SCN-06", "execution": "executed", "review": "pending-review", "verdict": "not-accepted" },
    { "scenarioId": "SCN-07", "execution": "executed", "review": "pending-review", "verdict": "not-accepted" }
  ],
  "triggered": [
    { "member": "context.lineTo", "sessionScope": true, "totalCount": 38368 },
    { "member": "context.translate", "sessionScope": true, "totalCount": 24477 },
    { "member": "context.rotate", "sessionScope": true, "totalCount": 20887 },
    { "member": "context.fillStyle", "sessionScope": true, "totalCount": 15909 },
    { "member": "context.save", "sessionScope": true, "totalCount": 15828 },
    { "member": "context.restore", "sessionScope": true, "totalCount": 15826 },
    { "member": "context.beginPath", "sessionScope": true, "totalCount": 12535 },
    { "member": "context.fill", "sessionScope": true, "totalCount": 12317 },
    { "member": "context.moveTo", "sessionScope": true, "totalCount": 11990 },
    { "member": "context.closePath", "sessionScope": true, "totalCount": 11990 },
    { "member": "context.drawImage", "sessionScope": true, "totalCount": 10937 },
    { "member": "context.scale", "sessionScope": true, "totalCount": 3243 },
    { "member": "context.fillRect", "sessionScope": true, "totalCount": 2720 },
    { "member": "context.arc", "sessionScope": true, "totalCount": 545 },
    { "member": "context.font", "sessionScope": true, "totalCount": 435 },
    { "member": "context.textAlign", "sessionScope": true, "totalCount": 327 },
    { "member": "context.fillText", "sessionScope": true, "totalCount": 327 },
    { "member": "context.globalAlpha", "sessionScope": true, "totalCount": 324 },
    { "member": "context.rect", "sessionScope": true, "totalCount": 218 },
    { "member": "context.clip", "sessionScope": true, "totalCount": 218 },
    { "member": "context.textBaseline", "sessionScope": true, "totalCount": 216 },
    { "member": "context.measureText", "sessionScope": true, "totalCount": 216 },
    { "member": "context.lineCap", "sessionScope": true, "totalCount": 108 },
    { "member": "canvas.height", "sessionScope": true, "totalCount": 18 },
    { "member": "canvas.width", "sessionScope": true, "totalCount": 18 },
    { "member": "context.createPattern", "sessionScope": true, "totalCount": 3 },
    { "member": "context.filter", "sessionScope": false, "note": "SCN-02 快照记录 2 次 set；发生在 200000 条缓冲区写满之后，未进入全会话聚合" },
    { "member": "context.clearRect", "sessionScope": false, "note": "SCN-03 快照记录到该调用；发生在缓冲区写满之后，未进入全会话聚合" },
    { "member": "context.globalCompositeOperation", "sessionScope": false, "note": "SCN-03 快照记录到 source-atop；发生在缓冲区写满之后，未进入全会话聚合" }
  ],
  "untriggered": [
    { "member": "context.strokeRect", "fallback": { "layer": "ACC-03", "evidenceRef": "test/cases/rect/stroke.case.ts（#17）" } },
    { "member": "context.arcTo", "fallback": { "layer": "ACC-03", "evidenceRef": "test/cases/path/fill.case.ts（#19）" } },
    { "member": "context.quadraticCurveTo", "fallback": { "layer": "ACC-03", "evidenceRef": "test/cases/path/fill.case.ts（#19）" } },
    { "member": "context.ellipse", "fallback": { "layer": "ACC-03", "evidenceRef": "test/cases/path/fill.case.ts（#19）" } },
    { "member": "context.stroke", "fallback": { "layer": "ACC-03", "evidenceRef": "test/cases/path/stroke.case.ts（#19）" } },
    { "member": "context.setTransform", "fallback": { "layer": "ACC-02", "evidenceRef": "test/cases/state/transform.case.ts（#12）" } },
    { "member": "context.strokeText", "fallback": { "layer": "ACC-03", "evidenceRef": "test/cases/text/render.case.ts（#20）" } },
    { "member": "context.createLinearGradient", "fallback": { "layer": "ACC-02", "evidenceRef": "test/cases/raster/gradient.case.ts（#38）" } },
    { "member": "context.strokeStyle", "fallback": { "layer": "ACC-02", "evidenceRef": "test/cases/state/properties.case.ts（#12）" } },
    { "member": "context.lineWidth", "fallback": { "layer": "ACC-02", "evidenceRef": "test/cases/state/properties.case.ts（#12）" } },
    { "member": "context.lineJoin", "fallback": { "layer": "ACC-02", "evidenceRef": "test/cases/state/properties.case.ts（#12）" } },
    { "member": "canvas.getContext", "fallback": { "layer": "ACC-02", "evidenceRef": "test/cases/canvas/factory.case.ts（#16）；本场景中经注入拦截调用，未进入 context 轨迹" } },
    { "member": "canvas.dispose", "fallback": { "layer": "ACC-03", "evidenceRef": "test/cases/lifecycle/dispose.case.ts（#23）" } },
    { "member": "gradient.addColorStop", "fallback": { "layer": "ACC-02", "evidenceRef": "test/cases/raster/gradient.case.ts（#38）" } }
  ],
  "outOfMatrix": [],
  "overall": "not-accepted"
}
```

`overall = "not-accepted"` 的原因（按格式要求的判定规则）：

1. 七场景 `review.status` 均为 `pending-review`（缺人工+AI 双方记录）；
2. `review.human` / `review.ai` 均为 `null`；
3. `library.dirty = true`（未跟踪的 `.pnpm-store/`；本 PR 已把它加入 `.gitignore`，后续运行可达到 `dirty === false`），正式 acceptance 要求 `dirty === false`；
4. **触发统计的口径（两个来源）**：
   - `sessionScope: true` 的 26 项来自**全会话聚合**，其计数之和恰为 **200000**，说明该聚合就是采集缓冲区本身（上限 200000 条，写满后不再记录）。因此它覆盖的是**会话前段**，不含写满之后发生的调用。
   - `sessionScope: false` 的 3 项（`context.filter`、`context.clearRect`、`context.globalCompositeOperation`）来自**各场景执行当时的快照**，它们发生在缓冲区写满之后，故不在全会话聚合中，但确定已触发。
   - 两者合并得到 29 个「已观察触发」的 supported 成员；**不能**把任一来源单独当作完整调用面。

## 报告范围说明

- `triggered` / `untriggered` 只覆盖 `SUPPORT_MATRIX` 中 `policy: supported` 的 43 个成员。
- `readonly`、`forward`、`unsupported` 共 58 个成员不进入本报告：`unsupported` 由 51 个 `context.<member>.contract` 用例负责；`readonly`/`forward` 由各自契约用例负责（见 `test:matrix` 输出）。
- 加入 `.pnpm-store/` 到 `.gitignore` 之后，后续运行会产生不同的 `sourceHash`；本记录的 hash 只绑定本次执行，旧评审不可跨提交复用。

## 结论边界（必须与上文一致）

- 本记录证明的是**场景可达性、API 轨迹覆盖与运行期错误面**，不是像素兼容结论。
- 场景参考/兼容渲染对的像素结论仍为 **pending-review**；按 [#7](https://github.com/shuizhongyueming/canvas2d-webgl/issues/7) 与 [evidence-format.md](evidence-format.md)，需人工+AI 对同一运行的渲染对逐例评审。
- **本次未生成截图对**：七场景中只有 SCN-07 取得兼容侧单张画面；其余场景只采集 API 轨迹与状态。因此像素评审**无法据此进行**，需在具备截图对采集能力后补做。
- 观察面 ≠ 全矩阵覆盖：轨迹中 0 个 `unsupported-api` / 0 个 `not-implemented` 只说明**上限内采到的 200000 条轨迹**中没有触发这两类错误；它既不是全矩阵覆盖，也不是整场游戏的完整调用面。矩阵覆盖由 `test:matrix`（#24）与 ACC-01~05 承担。
- 本次未执行：vivo 真机（ACC-07）；硬件 GPU 之外的对照（本次为 ANGLE Metal 硬件后端）。

## 复现方式

1. 以 `~` 为根，静态服务器指向 `gc-2026/packages/unknown-epic-rage/src`，并把 `canvas2d-webgl/dist` 挂到 `/__compat/`。
2. 通过 CDP `Page.addScriptToEvaluateOnNewDocument` 注入采集器：`getContext("2d")` 对 `#canvas` 返回 `createCompatCanvas(canvas, { onContextLost, onContextRestored }).getContext("2d")`。
3. 打开 `index.html`，按上文每场景步骤操作。
4. 采集器输出 `window.__probe`（`trace`、`errors`、`lost`、`restored`、`phases`）。
