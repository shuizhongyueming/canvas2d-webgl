# 工程与共享契约 v1

落地票：[工程骨架、共享接口与支持矩阵契约](https://github.com/shuizhongyueming/canvas2d-webgl/issues/10)。需求依据：[规格](../specs/canvas2d-webgl.md)、[ADR-0001](../adr/0001-fbo-scene-texture-native-rasterization.md)、[开发计划](../plans/development.md)。

## 当前交付

这是工程与协作契约。公开入口 `createCompatCanvas` 已接入真实创建（[#16](https://github.com/shuizhongyueming/canvas2d-webgl/issues/16)）：输入校验、离屏工厂同步探测、GPU 能力检测与资源分配、状态/context 组装、画布三分法转发；失败按错误表同步抛带 `code` 的错误并回滚库资源，不返回半初始化对象。尚不是兼容渲染器：绘制入口按特性票逐步接入，矩形三方法（`fillRect`/`clearRect`/`strokeRect`，[#17](https://github.com/shuizhongyueming/canvas2d-webgl/issues/17)）及批准路径构造方法、无参 `fill`/`stroke`（[#19](https://github.com/shuizhongyueming/canvas2d-webgl/issues/19)）已实现；文字三方法（`fillText`/`strokeText` 三参、`measureText().width`，[#20](https://github.com/shuizhongyueming/canvas2d-webgl/issues/20)）已实现，连同 `font`/`textAlign`/`textBaseline` 归 text 特性，font 字符串经 raster 接口 `normalizeFont` 做原生回读校验；合成状态（`globalCompositeOperation` 的 `source-over`/`source-atop`/`source-in`/`lighter` 与 `filter` 的 `brightness(120%)`/`none`，[#22](https://github.com/shuizhongyueming/canvas2d-webgl/issues/22)）已接入 GPU 混合与片元处理；裁剪（`clip()`/`clip("evenodd")`、[#21](https://github.com/shuizhongyueming/canvas2d-webgl/issues/21)）已以场景 stencil 实现，`source-in` 三遍处理被有效裁剪约束；其余未安装的受支持成员抛 `not-implemented`，读回/导出按支持矩阵抛 `unsupported-api`。不要将契约单测通过当成 Canvas 兼容性通过。

- 运行时、共享契约与浏览器用例使用 strict TypeScript + ESM；Node 构建与测试工具保留 JavaScript ESM。开发机 Node >=22；Node 版本不代表 vivo 的 JS 运行时要求。
- `pnpm install --frozen-lockfile --ignore-scripts` 安装锁定的类型检查和测试开发依赖；生产代码无运行时依赖。
- `pnpm run check` 检查 TypeScript 源码、共享契约和公开类型约束；`pnpm run build` 用 tsc 编译为 ES2020 ESM JS 与 .d.ts 放入 dist，并编译浏览器用例；不植入平台 polyfill。
- `pnpm run test:unit` 递归发现 `test/**/*.test.mjs`，空目录退出 2。包含工程契约及测试设施纯逻辑回归。
- `pnpm run verify` = 类型检查 + 构建（含生成类型的消费检查）+ 单测。CI 同时运行真实 Chromium 设施自检，仍不代表兼容性验收。
- package 只导出 `createCompatCanvas`，类型入口为生成的 `dist/index.d.ts`；测试钩子、内部声明和测试脚本没有 package 子路径导出。当前 private，不做发布。

## 文件与接口所有权

| 文件/目录 | 后续 owner |
| --- | --- |
| `src/api.ts`, `src/index.ts` | 公开画布票接线；改变公开声明须核对规格 |
| `src/contracts/support.ts` | 支持矩阵公共契约；不能由某个特性扩大范围 |
| `src/contracts/errors.ts` | 稳定错误及初始化回滚；能力检测模块消费 |
| `src/contracts/features.ts` | context 组装机制；状态/context 票消费 |
| `src/internal/contracts.ts` | 下列共享数据/模块接口；消费者共同协调变更 |
| `test/types/testing.ts` | 测试设施票消费并实现驱动，GPU票实现钩子 |
| `test/cases/manifest/index.ts` | 最低 API/交互验收目录，声明不等于已执行 |
| `scripts/testing.mjs`, `test/harness/`, `test/report/` | 测试设施票接管真实运行器和报告 |
| `scripts/build*.mjs`, `scripts/browser-imports.mjs`, `scripts/hash.mjs`, `scripts/provenance.mjs`, `tsconfig*.json`, `test/package-types/` | 工程与测试设施 owner 共同维护构建、来源绑定及类型消费门槛 |
| `.github/workflows/contracts.yml` | 测试设施票后续增加真实浏览器门槛，届时移除“驱动必须缺失”的基础阶段检查 |

特性代码目录沿用开发计划。`src/features/<feature>/` 可以放多个文件，对外导出一个 `FeatureFactory(environment)`，返回 `FeatureDefinition {id, members}`；context owner 在创建时显式传入工厂列表，不能维护进程级全局注册表。运行时不扫描磁盘。各模块输出各自描述符，集成 owner 才修改入口列表。

`contextDescriptors(features)` 校验 feature id 唯一、成员已批准且归该 owner、描述符形状合法，再一次性返回安装用描述符；不会修改部分构造的目标。使用方式为 `Object.create(null, descriptors)` 或在私有对象上 `Object.defineProperties`。同一 owner 的多个源文件先在该 feature 工厂内组合，不能重复提交同名 feature id。

支持成员尚未安装时抛 `not-implemented`，排除成员抛 `unsupported-api`，未知拼写不挂桩。属性的 getter/setter 与方法调用分别报告；只读属性不生成 setter。工厂/guard 不应屏蔽原生非法参数语义。

## 数据约定

代码级结构见 `src/internal/contracts.ts`，以下内容同样是接口的一部分。

- `Matrix` 为 `[a,b,c,d,e,f]`，Canvas 列向量变换，设备像素左上原点、y向下。几何和纹理坐标转换只在设备入口处理，不在各特性重复翻转。
- `Color` 是直通 sRGB `[r,g,b,a]`，每通道 0..1。GPU场景纹理为预乘alpha，上传/着色只预乘一次。`RasterSource.alpha` 描述输入颜色语义，不推断浏览器画布内部的存储格式；原生canvas上传通过WebGL unpack约定转换。
- `DrawState` 是每次绘制的不可变快照；逻辑状态中的 `PaintRef` 是可变对象引用，save/restore保存引用。绘制时 `snapshot()` 捕获当前 paint version/stops；后续 addColorStop影响下一次绘制，不能追改已经提交的操作。
- `Paint.id` 与 path/clip id 只要求同一画布实例内唯一。渐变端点为用户空间坐标，绘制时经 `DrawState.transform` 求值，创建时变换不影响渲染；图案同样使用当前绘制坐标空间，不暗中添加 pattern.setTransform。图案在创建时经注入的离屏工厂同步捕获并冻结源位图（`PatternBitmap` 描述符：直通 sRGB RGBA8，alpha 语义同 `RasterSource`），此后不可变，不受源图像后续换 src 影响；描述符只含原始值、深冻结成立，canonical 像素由 paint 模块私有持有，GPU/raster 经内部访问器零拷贝消费，外部可达面拿不到像素缓冲。createPattern 图源限 CORS-clean（同源或带合法 CORS 头）；tainted 源在创建时同步抛 SecurityError，属有意偏差（原生推迟到读回），见 #41。缓存键包含相关版本/状态，不能仅比较id；对已捕获的图案，`id+version`（version 恒 0）重新成为充分缓存键。
- `PathCommand` 在构造时捕获变换，`PathSnapshot` 拷贝不可变命令序列。beginPath/reset生成新路径，不修改旧快照。描边使用调用时状态；路径与save/restore栈分开。
- `ClipSnapshot` 保存路径、rule和parent；null表示画布范围。调用clip时当前路径不清空；restore回到旧clip引用；resize/lost恢复时丢弃旧clip。每个快照另带内部 `mask(bounds)`：由裁剪特性闭包到 `Rasterizer.clip` 的原生覆盖素材，设备在每次绘制时把链上各级依次写入 stencil（第 i 级只在上一级值 i-1 处递增到 i，内容按 EQUAL 深度测试）。掩码按 0.5 alpha 阈值二值化，因此裁剪边缘是硬边，不能宣称与原生软边逐像素一致；该差异是批准 stencil 路线的预期结果，记录见[决策 #52](https://github.com/shuizhongyueming/canvas2d-webgl/issues/52)，曲线/亚像素边界作为渲染对评审，整数对齐的裁剪几何可逐像素相等。场景 renderbuffer 为 STENCIL_INDEX8，0 保留给"裁剪外"，嵌套上限 255 级，普通绘制超出报 `resource-limit`；`source-in` 还需额外一级区分源覆盖，因此在 255 级时报 `resource-limit` 且不改动场景，不钳制引用后静默清空。裁剪特性通过 `FeatureEnvironment.lifecycle` 注册 reset/lost/restored/disposed hooks；会话在 hooks 之前调用 `state.reset()`/`state.discardClips()` 与 `raster.clearCache()`，hook 本身不重复清理。
- `DrawOperation` 对应一次Canvas调用。`sourceBounds`仅是源覆盖范围，不是合成范围；例如source-in可能影响clip内源以外的像素。`kind: empty` 不能一律当no-op；参数非法/规定无效操作应在入口决定，不发送绘制操作。
- clear操作有自己的覆盖几何，不能由paint/globalAlpha/filter控制；sourceBounds/clip仍有效。不同源种类共用一次合成操作，不按每个子路径重复合成。
- `GPUDevice.draw()` 同步消费原生源、按调用顺序写入场景FBO；微任务只处理present，不延迟外部canvas取样。native源引用在draw返回后不得再用于延迟上传。
- `RasterSource` 是原生辅助素材及设备空间位置/尺寸，调用方在draw返回后release；release幂等。pixel尺寸与设备bounds可以不同，消费者必须显式使用二者进行UV/定位。外部源的寿命归调用方，不进入库资源清理栈。
- `ResourceLease` 是一个引用计数租约，不暴露GL对象。handle的generation绑定设备；缓存持有与活跃操作各有自己的租约，通过GPUDevice.retain(handle)取得第二份引用；过期generation不可retain。淘汰仅释放缓存引用，GPU模块在最后租约释放时删除资源；陈旧generation release不得误删新对象。
- 所有GPU对象由设备拥有。原生素材LRU归raster模块，所有权与GPU纹理分开。`ResourceOwner.register()` 的注销函数转移清理责任，`releaseAll()`反向清理全部资源，清理失败仍排空并在末尾抛首个清理异常；dispose和初始化失败不销毁调用方目标，不调用loseContext。
- device generation在成功resize、loss、restore和dispose时改变；挂起present带创建时generation，失效后不能写入新scene。`present()`仅内部调度可调用，不成为公开flush。
- `Presenter.request()`按批准的任务/微任务规则合并提交，不能仅凭用了queueMicrotask认为满足语义。Promise追加绘制/rAF/尺寸重置竞态由GPU票与后续组合票实测。

## 错误与回滚

| code | 场景 |
| --- | --- |
| `disposed` | 已处置对象的拦截入口 |
| `unsupported-api` | 规范内明确排除的API、重载或合法但超支持范围的值 |
| `invalid-target` | 目标不是可用画布或绑定了不兼容上下文 |
| `invalid-factory` | 缺少所需注入工厂，或工厂返回非法/非独立画布 |
| `webgl-unavailable` | 无可用WebGL 1上下文 |
| `context-attributes-mismatch` | 实际GL属性不符合批准配置 |
| `capability-unavailable` | 原生辅助API、离屏捕获/重放所需工厂、字体测量入口、stencil等必需能力缺失 |
| `size-unsupported` | 平台拒绝物理尺寸变更 |
| `resource-limit` | MAX_TEXTURE_SIZE等明确资源限制 |
| `initialization-failed` | 未属于更具体code的库资源初始化失败 |
| `not-implemented` | 需求已批准但当前版本尚未实现，绝不作为成功结果 |
| `contract-violation` | 模块重复注册、所有权或数据接口被违反 |

受支持 API 的非法输入继续使用原生异常/忽略规则，不能全部包装为上述错误。规范外拼写错误保持缺席（调用不存在方法时是TypeError）。

创建过程分为验证输入→探测能力→分配资源→安装成员→返回对象；每取得一份库资源立即登记逆序cleanup。任何步骤失败调用 `rollbackInitialization` 排空清理栈并原样抛回初始失败；清理异常不阻断其余释放，也不覆盖原始错误。对已经初始化的资源释放同样必须幂等。回滚不能返回半初始化canvas。

## 支持矩阵与测试发现

`SUPPORT_MATRIX` 逐项声明target/name/kind/owner/policy、受支持的参数数量、取值、图像来源和原生默认值；它不记录实现进度。默认lineJoin=miter、textAlign=start、textBaseline=alphabetic不表示允许写入矩阵外合法值。

`REQUIRED_CASES` 按成员合同、重载、取值、来源及绘制结果分配最低case ID。ID由成员和具体值生成，不能重用或更改含义；新增组合可另加case，不能删最低目录以消除失败。`test/cases/manifest/index.ts` 补充跨特性case ID。它们是验收需求目录，**没有可运行用例，不能计为通过**。

- 工程单测：`test/**/*.test.mjs`，Node内置test runner自动发现，文件排序稳定，不跟随符号链接。
- 后续浏览器用例：`test/cases/<feature>/*.case.ts`，命名导出 `cases: CaseDefinition[]`；设施票递归发现、检查重复id与未知requirement，核对最低目录并单列missing。
- `CaseDefinition.requirements` 引用矩阵的member id（例如`context.drawImage`）或规格id（例如`IMG-02`）；一个case可覆盖多个要求。case id仍须唯一，必需目录中的ID必须被显式实现。
- 两个adapter独立运行同一case，不共享参考像素或被测算法。语义差异也使用明确断言/观测值。模板type中的unknown需由测试设施adapter提供原生/兼容具体类型，不能直接断言为全量CanvasRenderingContext2D而隐藏不支持API。

## 测试CLI和观测协议

真实驱动及操作说明见[测试设施](testing.md)。选择可替换的真实Chromium浏览器driver，当前本机验证优先ego-browser；CI可配置独立Chromium driver，须真实执行WebGL 1并记录差异环境，不将个人浏览器会话作为CI依赖。

| 命令 | 后续固定输入 | 后续输出与退出语义 |
| --- | --- | --- |
| `test:browser` | `--output <dir>`；可选`--case <id>` | TestRun JSON、原生/实际/差异图；0采集完成且语义无失败，不代表像素验收通过 |
| `test:report` | `--run <run.json>` | 可查看渲染对与逐case状态的报告；不自动接受评审 |
| `test:acceptance` | `--run <run.json> [--reviews <reviews.json>]` | 核对必需集合、真实compat运行、语义和评审；仅全量通过才退出0 |

通用退出码：0本命令完成、1失败/非法输入、2阻塞/未执行/待评审。三个入口已实现；browser 需 --output，report/acceptance 需 --run。缺评审时 acceptance 退出2；报告生成成功不代表验收成功。

`TestHooks.readScene`只通过测试侧适配器获取实例关联，不能挂在公开canvas/context、options或package exports；取样不改变公开API。返回直通RGBA8、sRGB、左上行优先，alpha=0时RGB归零；GPU内部预乘读回的转换是钩子的责任。

`whenPresented(generation)`等待已排队的自动提交，不主动present；无待提交时返回已完成状态，generation失效/lost/dispose时reject，不能挂起。显示目标的可见性必须另测，不能只读scene判上屏。

`TestRun`、`CaseResult`、`ReviewRecord`见内部声明。语义结果、像素评审、是否执行分别存储；语义专用case可not-applicable，像素case不可用此值规避评审。评审绑定case/run/commit/environment/hash，必须同时有人工和AI记录；AI不能代填人类意见。全图均值及局部辅助统计都不能自动当容差门槛。

## 后续接续

工程契约已合并，测试设施接续见 testing.md；后续状态、GPU、raster、paint票按上述接口落地。无需重新创建工程或测试注册表；若发现签名不足，应先在票中标明消费者及最小变更，再协调公共契约，不能静默重命名。
