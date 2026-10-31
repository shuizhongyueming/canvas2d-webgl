# Canvas2D WebGL 兼容画布规格

版本：0.1。日期：2026-10-16。状态：需求已确认，实施暂停；首版公开契约、API 验收矩阵、渲染协作架构、目标环境矩阵、运行时场景验收办法与差分一致性判定办法已确定。

本规格整理自已确认的[设计访谈](../design/grill.md)。[GitHub Spec issue](https://github.com/shuizhongyueming/canvas2d-webgl/issues/1) 是后续规格讨论和变更的管理入口；本文件是可版本化的规格快照。需求变更先记录决策，再同步本文件，不以实现反推需求。

## 目标

为已有 Canvas 2D 游戏提供兼容画布：调用方传入尚未绑定上下文的目标画布，库在该画布上使用 WebGL 渲染，并返回可通过 `getContext('2d')` 绘制的对象。以样例游戏 `unknown-epic-rage/src/app.js` 的实际绘图 API 及组合语义作为首版必须通过的范围。

首版以兼容正确性为目标，不承诺通用 Canvas 2D 全量兼容、固定帧率、性能优于原生 2D，或未验证的平台覆盖。

## 已确认的功能要求

| 标识 | 要求 | 可观察的验收结果 |
| --- | --- | --- |
| CAN-01 | 输入为尚未绑定上下文的 HTMLCanvasElement 或平台对应画布，或已按库期望 GL options 绑定 WebGL 上下文的画布；WebGL 1 为最低基线 | 支持环境能建立兼容画布；无法建立所需能力或 GL options 不符期望时明确报告 |
| CAN-02 | 返回对象接口兼容的画布，调用方通过 `getContext('2d')` 绘制 | 多次取上下文保持身份；`context.canvas` 指向兼容画布 |
| CAN-03 | 目标画布在包装期间由库独占 | 调用方通过兼容对象绘制和调整尺寸；不要求库兼容外部对目标画布的并行修改 |
| CAN-04 | 设置宽高遵守 Canvas 2D 清屏、状态重置语义，包括赋回相同值 | 像素、变换、样式、状态栈、当前路径和裁剪恢复对应原生初始行为；无法改变实际尺寸时报能力限制 |
| CAN-05 | 普通使用无需显式 `flush`/`present` | 绘制自动上屏，跨帧内容符合 Canvas 2D 保留语义，支持的读回行为能看到此前绘制 |
| REN-01 | 主场景以 WebGL 渲染，允许原生离屏 2D 辅助 | 不以整帧原生 2D 绘制再上传作为默认实现；具体 GPU/辅助素材分工另行设计 |
| REN-02 | 注入离屏工厂只供库内部使用 | 内部资源由库管理；不包装、接管或拦截游戏自行创建的原生离屏画布 |
| IMG-01 | 支持原生图像和原生 canvas 作为 `drawImage` 源 | 支持样例需要的重载、裁剪和缩放；多次读取外部 canvas 获得各调用时的内容 |
| IMG-02 | 外部 canvas 保守刷新，保持调用顺序 | 同帧“画源→取样→修改源→再取样”得到两个时间点的结果；调用方无需手动标脏 |
| IMG-03 | 首版排除兼容画布作为任何 `drawImage` 源 | 兼容 context 接收兼容画布（含自身复制）时明确报告不支持；不保证原生 context 接收兼容画布 |
| API-01 | 首版支持范围以样例实际使用为准 | 覆盖下列能力及其组合；以运行时场景验证补充静态扫描 |
| API-02 | 不支持能力不得静默空实现 | 明确报告能力缺失；受支持 API 的参数、状态、返回值和异常符合确认的原生语义 |
| LIFE-01 | 提供库级 dispose | 释放库资源、停止内部调度及兼容对象使用；不销毁目标画布，不主动丢失 GL context |
| LIFE-02 | 上下文丢失时暂停并通知 | 丢失期间不继续正常渲染；通知入口和暂停时调用行为待细化 |
| LIFE-03 | 恢复后重建资源、清屏并通知调用方重绘 | 不承诺恢复丢失前的历史像素 |

## 首版能力清单与证据边界

下列为已确认的能力范围。精确方法、属性、重载清单见「首版公开契约」中的 API 验收矩阵（决策见 [#4](https://github.com/shuizhongyueming/canvas2d-webgl/issues/4)）；本表保留组合语义与交互要求。

| 能力 | 已知样例需求 | 必须覆盖的交互 |
| --- | --- | --- |
| 图像 | `drawImage` 3/5/9 参数形式，原生图片和 canvas 源 | 变换、裁剪、透明度、合成、外部源更新顺序 |
| 矩形 | `fillRect`、`clearRect` | `clearRect` 遵守变换和裁剪；不能直接等同无条件清屏 |
| 状态与变换 | `save`、`restore`、平移、旋转、缩放、`setTransform` | 嵌套状态栈、非法值处理、当前路径不属于 save/restore 状态 |
| 路径 | 直线、弧、`arcTo`、椭圆、二次曲线，填充与描边 | 构造时变换、绘制时状态、闭合、抗锯齿及描边连接 |
| 裁剪 | 普通裁剪与 `evenodd` | 挖洞、嵌套、save/restore、与清除和合成结合 |
| 图案与渐变 | 重复纹理、线性渐变 | 路径填充、坐标变换及状态恢复 |
| 合成 | `source-over`、`source-atop`、`source-in`、`lighter` | 透明源、已有目标像素、裁剪边界及绘制区域以外的影响 |
| 滤镜 | 样例中的 `brightness(120%)` | 与图像、透明度、状态栈组合；不推定全 CSS filter 支持 |
| 文字 | `fillText`、`strokeText`、`measureText` 及实际文字状态 | 字体已加载、两条渲染路径字体一致、返回测量值与布局行为 |

## 首版公开契约

2026-10-16 依据 [#4](https://github.com/shuizhongyueming/canvas2d-webgl/issues/4) 决策确定；证据为样例静态画像（`gc-2026/packages/unknown-epic-rage/src/app.js`），运行时场景验收办法已由 [#8](https://github.com/shuizhongyueming/canvas2d-webgl/issues/8) 确定，覆盖证据待首版实现后按该办法采集。

- **创建入口**：单工厂函数 `createCompatCanvas(targetCanvas, options)`，同步返回兼容画布；无类、无全局注册表；输入为未绑定上下文的画布，或已按库期望 GL options 绑定 WebGL 上下文的画布（[#6](https://github.com/shuizhongyueming/canvas2d-webgl/issues/6) 修订）；绑定情况不符（已绑非 WebGL 上下文，或 GL options 不匹配）按用法错误/能力失败同步抛错。
- **离屏工厂**：`options.createOffscreenCanvas(width, height)` 同步返回平台原生离屏画布，仅供库内部使用；浏览器缺省 `document.createElement('canvas')`，小游戏平台必须注入；工厂返回非法对象按用法错误同步抛错。
- **能力检测与失败**：创建时同步探测 WebGL 1 及必要能力，失败同步抛带稳定 `code` 的 Error（message 说明缺失能力），不返回半初始化对象；运行期能力缺失同样抛带 code 错误；不静默降级，不返回结果对象。
- **转发三分法**：拦截类（`getContext`、`width`/`height`）由库接管语义；直通类（`style`、事件、`getBoundingClientRect` 等其余属性）默认转发目标画布；排除类（`toDataURL`/`toBlob`/`captureStream`/`transferControlToOffscreen` 及全部读回 API）显式抛错。不保证真实 DOM 身份不变。
- **读回/导出全部排除**：`getImageData`/`putImageData`/`createImageData`/`toDataURL`/`toBlob`/`captureStream` 均显式不支持。依据：样例零使用；WebGL 后端读回代价高；CAN-05 为条件句；差分测试读像素走测试钩子，不依赖公开 API。
- **上下文丢失/恢复**：`options.onContextLost()`/`onContextRestored()` 回调，不模拟 DOM 事件；丢失期间绘制与尺寸变更按原生 context-lost 语义静默无效（不抛错、不排队）；恢复后重建资源、清屏、回调通知重绘，不承诺历史像素。
- **dispose**：`compatCanvas.dispose()` 幂等；释放库资源、停止内部调度，不销毁目标画布、不主动丢失其 GL context；处置后拦截类 API 抛 `code: 'disposed'` 错误，直通类照常。**处置检查优先于参数转换与 no-op 判断**：处置后即使参数非法（如 `fillRect(NaN, 0, 10, 10)`）、参数缺失（`fillRect(0, 0)`）或本就该静默无效（`fillRect(0, 0, 0, 0)`），受支持的拦截类入口一律抛 `disposed`，顺序由装配层统一实施，不由各特性模块自行决定；直通类与 `dispose()` 自身不受影响。
- **未支持能力报告**：规范内未覆盖 API 挂载显式抛错桩（`code: 'unsupported-api'`，message 含 API 名）；规范外拼写错误得原生 TypeError；受支持 API 的非法参数保持原生异常语义。

### 首版 API 验收矩阵

首版支持集 = 下表；表外 Canvas2D API 一律显式不支持。

**context 方法**：`drawImage` 3/5/9 参（源：HTMLImageElement、游戏自建原生离屏 canvas）；`fillRect`/`clearRect`/`strokeRect`；`beginPath`/`moveTo`/`lineTo`/`closePath`/`arc`（含 6 参 anticlockwise）/`arcTo`/`quadraticCurveTo`/`ellipse`/`rect`；`fill()`/`stroke()` 无参；`clip()` 与 `clip("evenodd")`；`save`/`restore`（含 restore 多于 save 的容错配对）；`translate`/`rotate`/`scale`（含负值镜像）/`setTransform`；`fillText`/`strokeText` 3 参（无 maxWidth）；`measureText`（保证 `.width`）；`createPattern(image, "repeat")`；`createLinearGradient` + `addColorStop`。

**context 属性**：`fillStyle`（hex/rgba 字符串、CanvasPattern、CanvasGradient）、`strokeStyle`、`globalAlpha`、`globalCompositeOperation`（`source-over`/`source-atop`/`source-in`/`lighter`）、`lineWidth`、`lineCap`（butt/round）、`lineJoin`（round）、`font`、`textAlign`（left/center/right）、`textBaseline`（top/middle/bottom）、`filter`（仅 `"brightness(120%)"` 与 `"none"`）。

**canvas 级**：`width`/`height`（重置语义）；`getContext('2d')` 恒返回同一对象；`ctx.canvas` 指回兼容画布；`getContext` 非 `'2d'` 类型按原生语义返回 `null`；`style`、事件、`getBoundingClientRect` 走直通。

**显式不支持示例**：全部读回/导出、`bezierCurveTo`、`createRadialGradient`、`setLineDash`、`resetTransform`、`isPointInPath`/`isPointInStroke`、`imageSmoothingEnabled`、`shadow*`、`miterLimit`、`filter` 其它函数、其余合成模式、`createPattern` 的 canvas 源、`measureText` 的 `.width` 外属性。

不能因为样例静态未检出某 API 就推断运行分支不使用；矩阵的运行时确认办法见 [#8](https://github.com/shuizhongyueming/canvas2d-webgl/issues/8)，证据待执行采集。

## 渲染与资源协作架构

2026-10-16 依据 [#5](https://github.com/shuizhongyueming/canvas2d-webgl/issues/5) 决策确定；取舍与备选详情见 [ADR-0001](../adr/0001-fbo-scene-texture-native-rasterization.md)。

- **持久化**：画布内容保存在库自建的 WebGL 帧缓冲（场景纹理），提交点一次性 blit 上屏；上下文属性 `preserveDrawingBuffer: false`、`premultipliedAlpha: true`、`stencil: true`、`alpha: true`。
- **提交**：提交点为当前任务的微任务检查点，同一任务内绘制合并为一次上屏；`width`/`height` 设置立即按重置语义生效；无公开 flush/present。
- **分工**：`drawImage`、矩形等简单图元 WebGL 直接绘制；路径填充/描边（含 evenodd、凹形、曲线）与文字经内部原生离屏 2D 光栅化为纹理再合成（素材级辅助，非整帧上传，符合 REN-01）；首版不做 CPU 三角化。
- **裁剪/合成/滤镜**：模板缓冲裁剪（`evenodd` 用绕数/反转模板通道）；`source-over`/`source-atop`/`source-in`/`lighter` 映射为预乘 alpha 的 GL 混合，每个绘制操作为一次混合单元；`brightness(120%)` 在片元 shader 做颜色矩阵。
- **外部源与内部缓存**：外部 canvas 每次 `drawImage` 重新上传当前内容，无跨调用缓存与脏检测；内部素材（文字、路径纹理）由库自管 LRU 缓存；不接管外部 canvas。
- **WebGL 1 约束**：`createPattern(image, "repeat")` 用 shader `fract()` 平铺（NPOT 纹理禁 REPEAT）；`MAX_TEXTURE_SIZE` 超限按能力失败契约报告。
- **恢复重建**：上下文恢复时丢弃全部内部缓存并重建 GL 对象，场景纹理清为透明黑，外部源不做保留，随后 `onContextRestored` 通知重绘。

## 目标环境矩阵

2026-10-16 依据 [#6](https://github.com/shuizhongyueming/canvas2d-webgl/issues/6) 决策确定。结果为验证边界，不是兼容承诺。

| 平台 | 状态 | 最低运行时 | 验证边界 |
| --- | --- | --- | --- |
| Web（Chromium 系） | 首批 | 不锁版本，以验收时当前稳定版为基线 | 差分/语义单元测试为主；记录环境复现信息 |
| vivo 快游戏 | 首批 | `min_platform_version` 1200（跟随现有发布配置） | 真机验收延后至接入阶段；接入问题由调用方负责 |
| mi、hw、oppo、wx 等 | 未来候选 | — | 不宣称兼容，不阻塞首版验收 |

平台责任边界：平台接入改造（启动屏交接、XYX-VM 接入、字体加载）由调用方负责；小游戏主画布不可调整尺寸，尺寸变更在此类平台按 CAN-04 报能力限制，游戏须自行避免调整尺寸；上下文丢失/恢复事件的平台核验暂缓；当前阶段以单元测试为主。

## 差分与语义验收

### 测试原则

- 同一用例、相同输入和随机种子，在当前环境分别执行原生参考渲染和兼容渲染。
- 每次实时生成参考图，不使用持久化参考截图基线；不强制锁定本地浏览器版本。
- 不要求跨环境逐像素一致；每个宣称支持的环境均单独满足容差。
- 文字测试等待字体加载完成，两条路径使用相同字体。
- 同时验证像素和公开语义：属性、身份、状态栈、路径、尺寸重置、返回值及异常。
- 覆盖单接口、组合、跨帧和外部离屏源修改顺序；静态扫描不能替代真实游戏场景验收。

### 误差判定

不用单一全图平均误差判通过（实测证据：局部注入错误的全图均值可低于合法渲染差异，见 [#7](https://github.com/shuizhongyueming/canvas2d-webgl/issues/7)）。

数值阈值与区域分类不在实现前预设（2026-10-16，[#7](https://github.com/shuizhongyueming/canvas2d-webgl/issues/7)）：代理渲染校准（如缩放重采样对照）已否决。实现阶段由人工配合 AI 评审同一用例的参考/实际渲染对，判定是否一致并留存评审记录；量化阈值待积累评审证据后另定。连通差异块等定位手段可作为评审辅助。

每次运行记录浏览器/运行时、GPU、字体、DPR、尺寸、用例输入及随机种子等复现信息。失败产物至少包括参考图、实际图、差异图和语义失败信息。

### 验收证据矩阵

| 标识 | 用例组 | 通过依据 |
| --- | --- | --- |
| ACC-01 | 画布身份、尺寸、属性和状态栈 | 与原生行为逐项比较；支持和不支持范围均有记录 |
| ACC-02 | 图像、矩形、路径、文字、图案、渐变 | 对应 API 与组合语义通过差分；一致性判定按 [#7](https://github.com/shuizhongyueming/canvas2d-webgl/issues/7) 先经人工+AI 评审，量化阈值随证据另定 |
| ACC-03 | 裁剪、合成、变换、透明度、brightness 组合 | 包含嵌套、边缘、透明像素及顺序敏感用例 |
| ACC-04 | 外部 canvas 同帧多次修改和跨帧绘制 | 每个取样点与参考一致，不依赖手动提交或标脏 |
| ACC-05 | 尺寸重置、dispose、上下文丢失与恢复 | 状态变化、资源生命周期和通知符合已确定公开契约 |
| ACC-06 | 样例游戏运行时场景 | 实际经过的场景、API 覆盖、未覆盖路径均可追溯；不能只列静态调用点；场景清单与证据格式见 [#8](https://github.com/shuizhongyueming/canvas2d-webgl/issues/8) |
| ACC-07 | 各目标平台 | 平台与最低版本明确后，提交该环境独立验证记录；Chromium 结果不替代真机结果 |

## 明确排除和延后

- 真实 DOM 元素身份：不保证 `appendChild` 或 `instanceof HTMLCanvasElement`。
- 兼容画布作为图像源，包括兼容画布之间绘制、自身复制及原生 context 接收兼容画布。
- 接管游戏外部离屏工厂、包装外部 context 或要求游戏手动标记脏状态。
- 全量 Canvas 2D / CSS filter 兼容保证，未约定 API 的静默空实现。
- 性能基准、性能准入阈值及优化工作，当前均不纳入。
- 未经验证的平台兼容率，以及上下文恢复后保留历史像素的承诺。
- 平台接入改造（如 vivo 启动屏与主画布交接、XYX-VM 接入、字体加载）：由调用方负责，见 [#6](https://github.com/shuizhongyueming/canvas2d-webgl/issues/6)。

## 待决策项与推进门槛

1. ~~首版公开接口与 API 验收矩阵~~：已解决，见「首版公开契约」与 [#4](https://github.com/shuizhongyueming/canvas2d-webgl/issues/4)。
2. ~~混合渲染与平台适配设计~~：已解决，见「渲染与资源协作架构」、[#5](https://github.com/shuizhongyueming/canvas2d-webgl/issues/5) 与 [ADR-0001](../adr/0001-fbo-scene-texture-native-rasterization.md)。
3. ~~首批目标平台与最低运行时~~：已解决，见「目标环境矩阵」与 [#6](https://github.com/shuizhongyueming/canvas2d-webgl/issues/6)。
4. ~~差分分类和容差校准方案~~：已解决为「实现前不预设」——实现阶段人工+AI 评审实测渲染对，量化阈值随评审证据另定，见 [#7](https://github.com/shuizhongyueming/canvas2d-webgl/issues/7)。
5. ~~样例运行时场景与验收证据~~：已解决，场景清单与证据格式见 [#8](https://github.com/shuizhongyueming/canvas2d-webgl/issues/8)；证据采集待首版实现后执行。

决策票解决问题，不是实现任务。当前仅整理规格和决策地图；后续获得实施指令后，才将已明确部分拆为实现工作。各票具体状态和依赖以 GitHub Issues 为准。

## 当前事实与变更记录

- 2026-10-16：用户确认最终设计，可作为后续实现依据；前一会话只有研究与访谈，没有库或真机验证。
- 2026-10-16：本轮曾提前试写最小矩形/状态实现，两个初步浏览器用例通过。这不是完整测试体系、兼容性验收或已批准架构；用户要求改为先整理 spec，试写文件已移出仓库备份，不属于本规格交付。
- 2026-10-16：用户要求使用 GitHub CLI 创建 `shuizhongyueming/canvas2d-webgl` 公开仓库，并用 GitHub Issues 管理规格与后续决策。
- 2026-10-16：依据 [#4](https://github.com/shuizhongyueming/canvas2d-webgl/issues/4) 确定首版公开契约与 API 验收矩阵：创建入口、离屏工厂、能力失败、转发三分法、读回/导出全部排除、dispose 与上下文丢失/恢复形式、未支持 API 显式桩报告；待决策项第 1 条相应移除。
- 2026-10-16：依据 [#5](https://github.com/shuizhongyueming/canvas2d-webgl/issues/5) 确定渲染与资源协作架构：FBO 场景纹理持久化、微任务检查点提交、路径/文字原生光栅化纹理、模板裁剪与 GL 混合、外部源每用必传、WebGL 1 约束与恢复重建边界；另记 ADR-0001；待决策项第 2 条相应移除。
- 2026-10-16：依据 [#8](https://github.com/shuizhongyueming/canvas2d-webgl/issues/8) 确定样例游戏运行时场景验收办法：7 项场景清单（loading、战斗、换装、结算两形态、窗口缩放、上下文丢失/恢复）、可重复人工步骤脚本（作弊键与存档预设）、按场景 API 轨迹与矩阵对账、未触发由单元差分兜底、命中矩阵外 API 另建决策票、证据格式与仓外存放边界；待决策项第 5 条相应移除。
- 2026-10-16：依据 [#6](https://github.com/shuizhongyueming/canvas2d-webgl/issues/6) 确定目标环境矩阵：首批 Web（不锁版本）+ vivo 快游戏（min_platform_version 1200），其余平台为未来候选；入口输入修订为「未绑定或已按期望 GL options 绑定 WebGL 的画布」（同步修订 CAN-01 与创建入口契约）；平台接入改造、XYX-VM 接入与字体加载由调用方负责；小游戏主画布不可调整尺寸按 CAN-04 报能力限制；上下文丢失/恢复平台核验暂缓；待决策项第 3 条相应移除。
- 2026-10-16：依据 [#7](https://github.com/shuizhongyueming/canvas2d-webgl/issues/7) 确定差分一致性判定办法：实现前不预设区域分类与数值阈值、否决代理渲染校准；实现阶段人工+AI 评审实测渲染对，量化阈值随评审证据另定；明确不用单一全图平均误差（有实测证据）；待决策项第 4 条相应移除。
- 2026-10-22：依据 [项目审核](../reviews/project-review-2026-10-22.md) 的复核结果补两条口径。其一，dispose 处置检查的**优先级**写入公开契约：受支持的拦截类入口先判处置再转换参数，顺序由装配层统一实施。其二，明确「跨光栅后端差异」的归因规则：`willReadFrequently` 只是读取优化提示，不代表跨平台或跨驱动的逐字节确定性；内部光栅回归使用与内部画布一致配置的参考并保留严格断言，公开 API 差分仍与实际原生画布比较，两个后端表现不同只记为待归因、需单独评审，不自动进入接受项。最终验收由 [#57](https://github.com/shuizhongyueming/canvas2d-webgl/issues/57) 与 [#58](https://github.com/shuizhongyueming/canvas2d-webgl/issues/58) 承接。

- 2026-10-31：依据 [软覆盖修复决定](https://github.com/shuizhongyueming/canvas2d-webgl/issues/81) 修订矩形直通和二值模板裁剪：小数/旋转矩形使用原生局部覆盖，裁剪改为原生整链软覆盖并由 GPU 合成；source-in 保留原目标 alpha 并正确处理裁剪内源外区域。保持 WebGL 1、持久场景 FBO、同步素材消费、自动上屏及公开 API 支持集。允许额外光栅/纹理开销，资源嵌套上限不变；详见 [ADR-0002](../adr/0002-soft-coverage.md)。该决定不构成最终像素验收。
