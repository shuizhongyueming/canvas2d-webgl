/**
 * 本地启动入口的配置格式（issue #66 预留，不实现页面产品）。
 * 实际本地服务与页面由协调票（#71）实现；本文件只冻结配置形状。
 */
export interface LiveToolConfig {
  /** 本地 HTTP 服务端口；0 表示由服务选择空闲端口。 */
  readonly port: number;
  /** 准备与运行阶段的超时（毫秒）；须覆盖最终呈现与取样。 */
  readonly timeouts: {
    readonly prepare: number;
    readonly run: number;
  };
  /** 构建产物根目录；默认 dist/live，由构建票维护。 */
  readonly buildRoot: string;
}

export const DEFAULT_LIVE_TOOL_CONFIG: LiveToolConfig = {
  port: 0,
  timeouts: { prepare: 10000, run: 10000 },
  buildRoot: "dist/live",
};
