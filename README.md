# canvas2d-webgl

面向现有 Canvas 2D 游戏的 WebGL 兼容画布项目。

**当前阶段：需求已确认，整理规格与决策；尚未交付渲染库。** 用户要求先用 spec 和 GitHub Issues 推进，不立即实施。

## 规格与记录

- [规格快照](docs/specs/canvas2d-webgl.md)：功能边界、验收要求、待决策项。
- [GitHub Issues](https://github.com/shuizhongyueming/canvas2d-webgl/issues)：规格变更、wayfinder 地图和决策票。
- [设计访谈](docs/design/grill.md)：已确认输入与修正历史。
- [术语表](GLOSSARY.md)。
- [可行性报告](docs/research/canvas2d-webgl-feasibility.md)与[现成方案核验](docs/research/existing-canvas2d-webgl.md)：历史研究，不能视为已实现能力；与最新确认不一致时以规格为准。

## 已确认方向

- 接受未绑定上下文的目标画布，以 WebGL 1 为最低基线，返回通过 `getContext('2d')` 使用的兼容对象。
- 主场景使用 WebGL；原生离屏工厂只供库内部辅助绘制使用，不接管游戏自行创建的 canvas。
- 外部原生 canvas 作为图像源时保守刷新并保持调用顺序；首版排除兼容画布作为图像源。
- 语义与像素差分并行，每次同环境实时生成原生参考；数值容差待实验校准。
- 性能基准和优化延后；目标平台和最低版本未指定，不宣称真机兼容。

后续先沿决策地图澄清公开接口、渲染/适配方案和验收标准，再单独进入实施阶段。
