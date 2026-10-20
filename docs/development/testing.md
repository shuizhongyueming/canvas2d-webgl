# 真实浏览器测试与评审设施

对应 [实施：真实浏览器语义与差分测试设施](https://github.com/shuizhongyueming/canvas2d-webgl/issues/11)。设施可独立运行；原生对原生自检不是兼容库验收。公开工厂和 GPU 钩子尚未实现时，compat 分支明确 blocked，不切换为 native。

## 安装及命令

Node >=22，`pnpm install --frozen-lockfile --ignore-scripts`，然后 `pnpm exec playwright install chromium`（Linux CI 使用 `--with-deps`）。Playwright 和 pngjs 仅用于开发测试，生产包没有运行依赖或测试子路径导出。

```sh
pnpm run verify
# 设施自检：正常原生对照 + 单像素故障定位 + 显示面 DOM overlay 定位；每次生成新的 UUID 子目录。
pnpm run test:browser --self-test --output test-results/local
# 命令输出完整 run.json 路径，用它替换下方 <run.json>。
pnpm run test:report --run <run.json>
pnpm run test:acceptance --run <run.json> --reviews <reviews.json>
# 支持矩阵覆盖对账（按前置票分组，只读运行产物）；口径见 docs/acceptance/matrix-reconciliation.md
pnpm run test:matrix --run <run.json> --out <run目录>/matrix.md
# 真实浏览器故障回归；本机默认不指定 GPU 后端。
pnpm run test:smoke
# CI 明确选择 SwiftShader WebGL；环境字段记录实际 renderer，绝不重试降级。
pnpm run test:smoke --software
# 后续特性实现后，自动发现 test/cases/**/*.case.ts。
pnpm run test:browser --output test-results/compat
pnpm run test:browser --output test-results/compat --case context.fillRect.render
```

默认使用隔离的 Playwright Chromium，独立 browser context/page 确保 reference 与 actual 不共享 DOM、字体状态、随机状态或模块实例。`--executable <Chromium路径>` 可显式选当前安装的 Chromium；可在本机 ego-browser 查看报告和检查环境，CI 不依赖个人会话。`--software` 显式选择 SwiftShader，属于真实浏览器 WebGL 执行环境，不是 mock 或原生替代，不代表硬件 GPU 或 vivo 验证。默认没有缺 GPU 后自动降级的逻辑。若可用浏览器自选软件 renderer，原样记录 renderer，不隐瞒后端。

输出必须位于仓外或被忽略的 `test-results/` 下，不提交图像基线或游戏资料。`run.json` 记录实际浏览器、GPU/GL attributes、DPR、平台、字体、日期、尺寸、seed、commit、dirty 状态和源快照 hash。源快照包括 Git 管理文件及未忽略新文件；采集途中修改文件会使 run blocked。新提交、源变化、环境变化和图像变化均不可直接复用旧评审。

退出码：采集 0 = 所选用例采集完成且语义无失败；1 = 语义/渲染执行失败或非法输入；2 = 缺环境、skip、未实现或无用例。报告 0 仅表示 HTML 已生成，内含验收状态。验收 0 才表示全部当前必需用例及额外已定义用例满足要求；1 = 明确失败/拒绝；2 = 未执行、缺产物、待审/旧评审。`--case` 可以开发时部分采集，但不能缩减完整验收目录。

## 特性 agent 的接入方式

每个特性在自己目录新增 `*.case.ts`，导出 `cases` 数组，按 `test/types/testing.ts` 的 `CaseDefinition` 提供：稳定 id、已批准 requirements、kind、尺寸、seed、fonts 及 `run(adapter)`。递归发现不跟随符号链接；重复 ID、未知 requirement、非法尺寸，以及降低必需 case 的 kind/requirements 均报错。最低目录没有实现的项明确标为 missing-implementation，不生成通过桩。

```ts
import type { CaseDefinition } from '../../types/testing.js';
export const cases: CaseDefinition[] = [{
  id: 'context.fillRect.render', requirements: ['context.fillRect'],
  kind: 'render', width: 64, height: 64, seed: 1, fonts: [],
  run({context}) { context.fillStyle = '#123456'; context.fillRect(4, 4, 40, 40); },
}];
```

同一脚本运行两次；参考路径直接调用真实 Canvas2D，不读取 compat 算法或像素。adapter.context / canvas 使用原生与兼容类型的联合，不能断言为完整 Canvas2D 隐藏排除 API。非共享 API 测试须显式缩窄类型，并根据已批准语义做断言。

- `assert(value,message)`：显式语义断言；失败记录 error。semantic/combined 用例至少提供一个 assertion 或 observation，空脚本不是语义通过。
- `observe(key,jsonValue)`：记录需比较的公开行为；两边使用 Node deep equality 比较。仅 JSON 值，不接受 undefined；异常应由用例捕获后记录 name/code 等稳定字段，不比较栈字符串。
- `random()`：同 seed PRNG；运行期间 Math.random 同样绑定它。输入应固定在 case 中；不要在模块加载时随机生成输入，或依赖当前时间。
- `skip(reason)`：明确 blocked，绝不计通过。
- `checkpoint()`：等待已有自动 present 和下一帧；不调用公开或私有 flush/present。每个用例末尾自动执行一次。多检查点语义可自行记录公开状态；当前像素产物是最终帧，多帧像素需求拆成明确独立 case。
- `fonts`：CSS font 描述符，等待 document.fonts.load / ready / check。需要自带字体时，在模块加载时注册 FontFace 并声明相应字体。不要把不存在的字体族被系统 fallback 当作字体覆盖证据。

## GPU / facade agent 接线

`test/harness/bridge.js` 的 `hooksFor(compatCanvas)` 是唯一测试侧接线点。GPU/facade owner 将其替换成私有实例映射 lookup 的 import；不修改公开 canvas/context/options，不在 package exports 新增测试 API。当前明确抛 test-hooks-unavailable。工厂从真实 `src/index.ts` 的编译产物 `dist/index.js` 导入，不能以 fixture 工厂或全原生实现冒充兼容库。

钩子 readScene 返回直通 RGBA8 sRGB、左上行优先、alpha=0 RGB=0；whenPresented 只等待已排队提交，不触发提交。generation 变化/lost/dispose 应 reject。测试模块读取 scene，浏览器 driver 另用合成器截图读取目标元素显示，两类证据互不替代。截图有白色页面背景，场景 PNG 保留透明度；reference/actual 使用同一背景，不把两种不同表面直接做差分。

## 报告与评审

每个像素用例产生六张 PNG：scene reference / actual / difference，以及 display reference / actual / difference。差异图只把任何 RGBA 差异标紫色，记录 changedPixels 和包围框供定位，**没有阈值、分类、平均误差准入或自动像素通过**。尺寸不一致记为测试失败（semantic: fail，退出 1；execution: executed 表示已尝试执行）。设施自检的单像素注入仅在 actual 的 scene 产物中，报告明确标记 injection，不能进入兼容证据。

`test:report` 生成可离线打开的 `report.html`，含嵌入图片、搜索框、三类状态、公开语义观测和环境。缺产物展示错误。`reviews.template.json` 的 human / ai 均为 null；复制为 `reviews.json` 后由真正评审者填写身份、日期、verdict（accepted/rejected），AI 另填 notes。代理不能代填人类确认。再运行：

```sh
pnpm run test:report --run <run.json> --reviews <reviews.json>
pnpm run test:acceptance --run <run.json> --reviews <reviews.json>
```

评审逐 case 绑定 runId、commit、sourceHash、environmentHash 与包含全部六张图的 artifactHash。验收重新读文件计算 hash、验证 PNG 和路径；检查当前源码及当前必需目录，忽略 run 里声称的 render: accepted，重新推导状态。重复记录、旧评审、缺任何一张图、skip、missing 都不放行。评审导入不修改原始 run，重新生成报告即可关联。记录是本地评审声明，不提供身份认证或防恶意篡改签名。

设施自检始终保持 infrastructure-self-test 范围，即使所有图片获评审也不能成为兼容验收。当前没有实际 compat 渲染对，因此没有提交人工像素通过记录，也不宣称七场景或 vivo 验证。

## 审查后明确的验收边界

`--reviews` 为可选参数；省略时按空评审集合处理，像素用例 pending-review，验收退出 2。开发中允许采集 dirty run 以调试和查看报告，但正式 acceptance 要求 `dirty === false`，缺少 dirty 字段也不会放行；提交后须重新采集，不能用旧 run 或旧评审作为新提交证据。

环境中的 GL attributes 当前来自独立探针，证明浏览器基础能力，不能视为被测 compat target 的配置证据。GPU/facade 接线时须补充真实 target 的属性、尺寸和 stencil 核验。当前没有真实 compat 渲染验收。

`execution: executed` 表示已经尝试执行，并不代表运行成功；当前协议没有 failed execution 枚举。产物解码或尺寸不符沿用 `semantic: fail` + error，退出 1；这是测试失败，不是像素评审 rejected。未知初始化错误也保持失败，不能默认当成环境不足来跳过。

新增 self.display-difference 仅在 actual 页面覆盖 4×3 的品红色 DOM 块，scene 应相同、display 应有 12 个差异像素，且分别核对 reference/actual 颜色，避免产物接反也通过。self.render-error 在抛错前绘制红色矩形，回归直接核对两张场景 PNG 的已绘制及未绘制位置。

采集在写文件之前校验输出路径：仓内仅允许被 Git 忽略的 test-results/，路径先解析符号链接；仓外目录可用。报告包含导入的人工/AI身份、日期、verdict和notes，即使记录过期也显示原文供排查，但有效性仍由门禁判断，不因展示记录而放行。

## TypeScript 用例与构建

运行库 `src/**/*.ts`、共享接口及浏览器用例 `test/cases/**/*.case.ts` 均进入 strict 类型检查，并开启 noUncheckedIndexedAccess、noImplicitOverride、verbatimModuleSyntax。Node 工程脚本和测试驱动仍使用 .mjs / .js，不作为生产实现模板。类型导入使用 import type；相对 ESM import 保持 .js 后缀，TypeScript 编译时解析到 .ts 文件。

`pnpm run build` 清理旧产物，将运行库编译到 dist，测试用例编译到 .build/test。类型入口 dist/index.d.ts 从实现生成，另用包入口消费测试验证正反类型约束，不维护第二份公开声明。产物目录均被忽略。

使用 pnpm run test:unit / test:browser / test:report / test:acceptance / test:smoke 会先构建；直接调用底层 node 脚本前需自行 pnpm run build。采集和报告入口检查源快照及编译产物 hash，发现缺失、过期或被修改的编译产物立即失败，避免用旧 JS 验证新 TS。修改源码/用例/协作文档后应重新构建。
