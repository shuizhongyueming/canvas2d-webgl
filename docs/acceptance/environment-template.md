# 环境记录模板

落地票：[#25](https://github.com/shuizhongyueming/canvas2d-webgl/issues/25)。每次场景执行填写一份；`ScenarioRun.environment` 内嵌本记录，或以 `environmentId` + 记录内容哈希引用（见 [evidence-format.md](evidence-format.md)）。

填写纪律：所有字段填执行时的实际值；无法确认的字段填「待核验」，禁止编造已验证前置值。字段值变化（新 commit、源变化、环境变化）后旧记录不可直接复用。

## 字段

| 字段 | 填写内容 |
| --- | --- |
| `date` | 执行日期（YYYY-MM-DD，含时区） |
| `operator` | 执行人/agent 标识 |
| `platform` | OS 与架构 |
| `browser` | 浏览器名称与完整版本（首批：Chromium 系当前稳定版，#6；不锁版本，记录实际值） |
| `gpu` | GPU/renderer 字符串（按实际报告值记录，不隐瞒软件后端） |
| `glAttributes` | 兼容目标画布实际 GL context attributes（`alpha`/`premultipliedAlpha`/`preserveDrawingBuffer`/`stencil` 等）；兼容库未接线前填「待核验」 |
| `dpr` | `devicePixelRatio` 实际值 |
| `canvasSize` | 目标画布 CSS 尺寸与物理尺寸 |
| `fonts` | `Montserrat-ExtraBold` 加载检查结果（`document.fonts.check` 实际返回）；游戏唯一字体经启动前预载（#8 事实） |
| `game` | 游戏标识与版本/commit（记录实际值；游戏文件不入仓） |
| `library` | 被测库 commit 与 dirty 状态 |
| `collector` | 注入采集器标识/版本与注入方式（仓外工具） |
| `environmentId` | 执行方给出的环境标识，供证据引用 |
| `notes` | 其他复现所需信息 |

## 可复制的空白模板

```markdown
- date: <待填>
- operator: <待填>
- platform: <待填>
- browser: <待填>
- gpu: <待填>
- glAttributes: <待核验>
- dpr: <待填>
- canvasSize: <待填>
- fonts: <待填：document.fonts.check 实际返回>
- game: <待填：标识与版本/commit>
- library: <待填：commit, dirty>
- collector: <待填：标识/版本/注入方式>
- environmentId: <待填>
- notes: <待填>
```

## 场景级附加字段

以下字段随场景记录（`ScenarioRun`）填写，不属于环境本体，但每次执行必须出现：

| 字段 | 填写内容 |
| --- | --- |
| `savePreset` | `localStorage["stickmanfuryv4"]` 预设值原样记录 + 应用方式（作弊键 3 / devtools）；无预设记 `null` 并说明初始存档状态（#8 决策 10） |
| `cheatKeysUsed` | 本场景实际使用的作弊键与目的 |
| `randomSource` | 固定记录事实：`Math.random` 无种子机制（#8 事实：静态 135 处），不锁种子、不承诺自动回放；另附本次观察到的随机差异说明 |
