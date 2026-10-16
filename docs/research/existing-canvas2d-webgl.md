# Canvas2D → WebGL 现成方案核验

核验日期：2026-10-15。结论来自项目自述及源码，未做小游戏设备运行验证。

**技术路线已被多个项目证明可行，但没有核验到可以直接承诺“大部分浏览器 Canvas2D 游戏无修改上线”的通用库。适合借鉴或按实际游戏 API 子集二次开发。**

| 项目 | 实际覆盖与限制 | 对小游戏环境的判断 |
|---|---|---|
| [play-co/webgl-2d](https://github.com/play-co/webgl-2d) | 项目自称 proof of concept；支持图片、矩形、变换、状态、直线路径、像素操作；弧线/曲线未支持，其他 API 空桩 | 可以参考精灵绘制，不宜作为通用兼容层直接上线 |
| [LuckyKat/pixi-canvas](https://github.com/LuckyKat/pixi-canvas) | 推荐 Pixi v3；每帧额外 start/flush；每帧自动清屏；canvas 作为 drawImage 源只初次转纹理，后续修改需处理 | 与保留画面、动态离屏画布等 Canvas2D 语义不等价；依赖较老的 Pixi 集成方式 |
| [jagenjo/Canvas2DtoWebGL](https://github.com/jagenjo/Canvas2DtoWebGL) | 覆盖变换、图像、曲线、文本、渐变、裁剪；明确不支持凹形填充、globalCompositeOperation、模糊阴影 | 可作为局部实现参考；依赖 litegl.js。文本不是纯 WebGL 解法，仍需原生 2D 画布制作字图集 |
| [karellodewijk/canvas-webgl](https://github.com/karellodewijk/canvas-webgl) | 作者称大部分功能有实现，但很多存在 bug；文本依赖 2D，超大图切片也依赖 2D；只有一种填充绕向规则 | 主画布只支持 WebGL、辅画布支持 2D 时才具备使用其文本路径的前提；仍须较重语义测试 |
| [brickmaker/webgl2-2d](https://github.com/brickmaker/webgl2-2d) | WebGL2 专用；README 明示尺寸重置行为不同、context attributes 未支持、多次 clip 和 save/restore 存在 bug | 不能默认覆盖只有 WebGL1 的平台；不能仅凭 checklist 认为全兼容 |
| [CanvasKit / Skia](https://docs.skia.org/docs/user/modules/canvaskit/) | Skia 的 WASM 实现，具有 WebGL surface 与成熟的路径、paint、文本基础设施；同时提供 Canvas2D shim | 最值得考察的完整渲染内核路线，但 WASM、加载方式、GPU context 绑定、字体资源、内存及包体须在目标平台实测 |

## 两个尤其容易误判的点

1. **“文本用 WebGL 绘制”可能仍依赖原生 2D 来生成纹理。** Canvas2DtoWebGL 源码的字体图集生成会调用 `createCanvas(...).getContext('2d')` 和 `fillText`；默认只生成少量字符，international 模式也只是扩展到码点 400 左右，不能据此推断支持中文。[源码](https://github.com/jagenjo/Canvas2DtoWebGL/blob/master/src/Canvas2DtoWebGL.js)
2. **CanvasKit 的 Canvas2D API 与 GPU 后端不能混为一谈。** 当前 main 的 `MakeCanvas(w,h)` 使用 CPU raster surface；最新源码另有 `MakeCanvasFromSurface(surface)`，用于把 GPU surface 包装进 Canvas2D shim。需核验选定发布包是否包含新入口，且该 shim 本身并非完全标准兼容。[htmlcanvas.js](https://github.com/google/skia/blob/main/modules/canvaskit/htmlcanvas/htmlcanvas.js)

CanvasKit shim 源码还显示：`fillText` 的 maxWidth 是 TODO；`measureText` 仅返回 width，由字形宽度求和；状态保存/恢复仍有 textAlign/textBaseline TODO。因此“Skia 能力强”不代表现成 Canvas2D shim 与浏览器 100% 对齐。[canvas2dcontext.js](https://github.com/google/skia/blob/main/modules/canvaskit/htmlcanvas/canvas2dcontext.js)

## 建议

先统计目标游戏实际使用的 API。图片/矩形/变换/alpha 为主时，小型定制 shim 更有希望兼顾体积和可维护性；复杂路径/裁剪/合成/文本多时，优先验证 CanvasKit 的平台启动链路，再评估语义适配。任何路线都先区分“只有主 canvas 不支持 2D”与“所有 canvas 均不支持 2D”，这直接决定文本与整帧转纹理方案能否复用平台能力。

上述小型项目的维护活跃度未通过提交时间逐项定量核验，因此不以“已停更”作为结论；选型负面判断主要依据其当前 README/源码明确公开的兼容性限制。
