# Canvas 2D → WebGL 游戏兼容层可行性

日期：2026-10-15。范围：标准及开源实现调研，并静态检查用户提供的 `gc-2026/packages/unknown-epic-rage/src/app.js`。没有执行游戏、没有修改游戏文件，也没有目标平台真机性能数据。

## 判断

可行，适合建设面向实际游戏集合的兼容层。不能把“实现大多数方法名”当成“多数游戏正确运行”：一个未实现的裁剪或合成模式就可能破坏整个场景。对本示例，建议先测试原生离屏 Canvas2D 整帧上传到主屏 WebGL，再决定是否开发混合渲染兼容层。目标平台和最低运行时版本尚未指定。

## 示例源码画像

下列为正则扫描得到的静态调用点数量，不是每帧次数，不代表执行过所有分支；短变量名方法调用仍可能有同名误计，需要运行时 instrumentation 复核。

| 特性 | 调用点或位置 | 影响 |
|---|---|---|
| drawImage | 57 | 图片和离屏画布均为源；支持 3/5/9 参数形式、纹理缓存及更新 |
| fillRect / clearRect | 33 / 2 | clearRect 还要遵守变换及裁剪，不能无条件 gl.clear |
| 状态与变换 | save 36，restore 39，translate 44，rotate 21，scale 15，setTransform 6 | 次数差异不等于状态栈错误，分支结构需动态检查 |
| 路径 | beginPath 49，lineTo 59，arc 22，arcTo 12，ellipse 1，quadraticCurveTo 2 | 需要路径填充、曲线细分、描边和抗锯齿 |
| clip | 4，含 3328、3527 行 evenodd | 外部大矩形加内部多边形形成挖洞式裁剪；不能用包围盒替代 |
| createPattern | 2811、2815、2819 行 | 地面/平台/结构重复纹理，必须参与路径填充与变换 |
| createLinearGradient | 6083 行 | 子弹拖尾渐变；在 render 中构建，应避免资源反复分配 |
| 合成 | source-over / source-atop / source-in / lighter | 多个离屏着色分支；8878 行主屏加亮效果 |
| 文本 | fillText 10，strokeText 1，measureText 7 | 需要字体、布局、测量及描边；也存在位图字体绘制路径 |
| filter | 808 行 brightness(120%) | 可专门实现亮度 shader，不必因此实现整个 CSS filter 集合 |
| 像素读写、模糊阴影 | 此文件未检出 | 有利于 GPU 兼容；其他依赖和动态调用未排除 |

10318–10329 行位于绘制流程内，创建离屏画布、绘图并 source-in 着色，然后主屏 drawImage；该分支若逐帧执行，会产生反复分配/上传，适合改为缓存。8639 行之后的 customiseTintCanvas 会被重复修改，因此不能只在第一次 drawImage 时上传它。

## 三条路线

### A. 原生离屏 2D → WebGL 整帧上屏

保留游戏 2D 绘图，把原主画布逻辑映射到离屏 2D，帧结束时更新纹理并用全屏四边形展示。前提是平台离屏 2D 支持所需 API，并允许其作为 WebGL 纹理源。标准 WebGL 支持 canvas 来源，但小游戏的裁剪实现必须实测。[WebGL 规范](https://registry.khronos.org/webgl/specs/latest/1.0/)

这是最小验证路径，不是无条件的生产性能结论。RGBA8 的 1280×720 图像约 3.69 MB，60 次/秒对应约 221 MB/s 的原始像素量；1920×1080 对应约 498 MB/s。这是尺寸计算，不是实测总线流量，实际是否复制、转换或共享取决于平台。不能把 getImageData→TypedArray→texImage2D 当成默认快速路径。

### B. Canvas2D 接口 → 自建 WebGL 后端，辅以原生离屏 2D

对精灵、矩形、变换、alpha、常用混合直接生成 GPU 绘制；文字和预生成着色素材使用原生离屏 2D，再缓存纹理。对本游戏还必须实现路径填充/描边、evenodd 裁剪、图案和渐变。可用 stencil 或遮罩实现裁剪；动态离屏源要有脏标记，状态变化要保持绘制顺序和正确批次边界。

不能把每个不支持的操作孤立地画到透明小画布再贴回：部分合成依赖目标已有像素，裁剪和滤镜也有上下文关系。必要时回退整个图层或整帧。

Canvas2D 的状态、路径及绘制顺序有标准语义；例如当前路径不属于 save/restore 状态，路径构建与变换的时机需要区分，canvas 调整宽高会重置状态。[HTML Canvas 标准](https://html.spec.whatwg.org/multipage/canvas.html)

WebGL 默认显示缓冲不是可以永久保留内容的 Canvas2D 位图。通用 shim 应评估持久 FBO 作为画布内容，再上屏，而不是依赖默认 framebuffer 跨帧保留。像素读回必须提交前序绘制，会形成同步压力；当前样例未发现该需求。[WebGL 规范](https://registry.khronos.org/webgl/specs/latest/1.0/)、[Mozilla WebGL 最佳实践](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)

### C. CanvasKit / Skia

可借用成熟绘图内核，通过适配层暴露 Canvas2D 接口。需验证 WASM、平台 WebGL 绑定、包体、字体加载、启动耗时、内存和 shim 语义缺口。[CanvasKit 官方文档](https://docs.skia.org/docs/user/modules/canvaskit/)

现成库详见 [现成方案核验](existing-canvas2d-webgl.md)。小型库目前核验到的缺口与本游戏的裁剪、合成等需求直接冲突，不能拿来就承诺上线。

## 平台核验与下一步

“主屏不支持 2D”不代表“离屏不支持 2D”。小米当前文档区分主屏和离屏默认上下文，但同页示例和描述不足以证明所有设备主屏只能 WebGL，应以目标运行时实测为准。[小米画布文档](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=2206)

1. 确定目标平台、最低版本、低端基准设备；测离屏 2D、纹理上传、evenodd、pattern、合成、文字和字体加载。若测 CanvasKit，再测 WASM 启动。
2. 对此游戏做整帧桥接原型，覆盖加载、主菜单、战斗、换装、结算和解锁页面；比较浏览器基线截图、触摸坐标和尺寸处理。
3. 记录 p50/p95 帧耗时、绘图与上传耗时、内存、连续运行稳定性；60fps 的总帧预算约 16.7ms，30fps 约 33.3ms。
4. 达标则使用桥接。若瓶颈是整帧绘图/上传，再做混合兼容层；若原生离屏功能不全，则评估 CanvasKit 或补实现。其他游戏继续做 API 画像，不以单一样例推断全部游戏。

最终建议：值得做一个真实游戏验证，但当前证据还不足以承诺通用兼容率、工期或帧率。
