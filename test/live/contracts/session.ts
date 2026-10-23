/**
 * 实时渲染对比工具的共同内部契约（issue #66）。
 * 只服务工具内部；不得从 dist 公开入口或包导出。
 * 冻结内容：展示分类、prepared execution 所有权、消息联合类型、
 * 阶段状态、RGBA8 像素输入、量测结果、反馈 JSON、视图事件与控制器状态。
 */

/** 执行轮次内的一侧。 */
export type Side = "native" | "compat";

/** 每轮唯一会话标识；外层页面生成，消息必须匹配才生效。 */
export type SessionId = string;

/** 单轮单侧执行阶段。completed 后保留环境直到切换/重跑进入 disposing。 */
export type SessionStage =
  | "preparing"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "disposing"
  | "disposed";

/** 展示资格分类（issue #62）：与用例定义同源，不据此推断执行成功。 */
export type DisplayClassification =
  | {
      readonly status: "included";
      /** 非空观察重点；只描述人工可见部分，不声称覆盖全部断言。 */
      readonly observation: string;
    }
  | {
      readonly status: "excluded";
      /** 非空排除原因。 */
      readonly reason: string;
    };

/** 规范化像素输入：sRGB、非预乘 RGBA8、左上起逐行；alpha=0 时 RGB 已归零。 */
export interface PixelData {
  readonly width: number;
  readonly height: number;
  /** 长度必须等于 width * height * 4。 */
  readonly pixels: Uint8Array;
}

/** 差异包围矩形，原始画布坐标、左上原点、整数像素。无差异时为 null。 */
export interface DifferenceBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 严格像素读回差异的量测结果（issue #64）。失败状态不携带有效指标。 */
export interface DifferenceMetrics {
  readonly totalPixels: number;
  readonly changedPixels: number;
  /** 0–1 比例；页面显示时换算为百分比。 */
  readonly changedRatio: number;
  /** 全部 RGBA 通道绝对差的最大值，0–255，含 alpha。 */
  readonly maxChannelDelta: number;
  readonly differenceBounds: DifferenceBounds | null;
}

/** 复制反馈的 difference 字段（反馈协议版本 1）。 */
export type FeedbackDifference =
  | {
      readonly protocolVersion: 1;
      readonly status: "measured";
      readonly nativeSize: { readonly width: number; readonly height: number };
      readonly compatSize: { readonly width: number; readonly height: number };
      readonly changedPixels: number;
      readonly totalPixels: number;
      readonly changedRatio: number;
      readonly maxChannelDelta: number;
      readonly differenceBounds: DifferenceBounds | null;
    }
  | {
      readonly protocolVersion: 1;
      readonly status: "failed";
      /** 无法归属单侧时为 null。 */
      readonly side: Side | null;
      readonly stage: SessionStage;
      readonly reason: string;
    };

/** 复制反馈 JSON；顶层仅 caseId、browser、difference 三类内容。 */
export interface FeedbackReport {
  readonly caseId: string;
  readonly browser: {
    readonly userAgent: string;
    readonly language: string;
    readonly devicePixelRatio: number;
    /** "not-tested" 表示未进行检测，而非检测后未发现。 */
    readonly fingerprintingProtection: "not-tested";
  };
  readonly difference: FeedbackDifference;
}

/**
 * 子执行器（iframe 内）发往外层页面的消息。
 * 缺 sessionId 或 side 的消息在类型层即不可构造；外层仍须运行时核对来源。
 */
export type RunnerMessage =
  | {
      readonly type: "ready";
      readonly sessionId: SessionId;
      readonly side: Side;
    }
  | {
      readonly type: "completed";
      readonly sessionId: SessionId;
      readonly side: Side;
      /** 最终原始像素；completed 状态必须携带。 */
      readonly pixels: PixelData;
    }
  | {
      readonly type: "error";
      readonly sessionId: SessionId;
      readonly side: Side;
      readonly stage: SessionStage;
      readonly reason: string;
    };

/** 外层页面发往子执行器的消息。 */
export type ControllerMessage =
  | {
      readonly type: "prepare";
      readonly sessionId: SessionId;
      readonly side: Side;
      readonly caseId: string;
    }
  | {
      readonly type: "start";
      readonly sessionId: SessionId;
      readonly side: Side;
    }
  | {
      readonly type: "dispose";
      readonly sessionId: SessionId;
      readonly side: Side;
    };

/**
 * prepared execution 所有权（issue #63）。
 * prepare 返回的资源归对应执行环境所有；dispose 幂等，不无限等待旧 run。
 */
export interface PreparedExecution {
  /** 保留测试原有 checkpoint、微任务与帧推进语义；返回时最后一帧已提交。 */
  run(signal: AbortSignal): Promise<void>;
  /** 最终原始像素读回；仅在 run 成功返回后调用。 */
  readPixels(): PixelData;
  /** 释放本侧全部登记资源；幂等；异常上报但不无限阻塞。 */
  dispose(): Promise<void>;
}

/** 用例/执行器登记的清理回调；切换或重跑时按登记逆序执行。 */
export type CleanupCallback = () => void | Promise<void>;

/** 清理登记协议：返回注销函数；登记与注销均幂等。 */
export interface CleanupRegistry {
  register(cleanup: CleanupCallback): () => void;
  /** 执行全部未注销的清理；幂等。 */
  disposeAll(): Promise<void>;
}

/** 视图层发往控制器的事件（issue #60 页面交互）。 */
export type ViewEvent =
  | { readonly type: "select-case"; readonly caseId: string }
  | { readonly type: "step-case"; readonly direction: -1 | 1 }
  | { readonly type: "rerun" }
  | { readonly type: "set-display-mode"; readonly mode: "split" | "overlay" }
  | { readonly type: "set-overlay-opacity"; readonly opacity: number }
  | {
      readonly type: "set-background";
      readonly background: "checker" | "white" | "black";
    }
  | { readonly type: "set-scale"; readonly scale: "fit" | "actual" }
  | { readonly type: "copy-case-id" }
  | { readonly type: "copy-feedback" };

/** 控制器暴露给视图的状态快照；执行中不提前给出最终差异。 */
export interface ControllerState {
  readonly sessionId: SessionId | null;
  readonly caseId: string | null;
  readonly stage: SessionStage | "idle";
  readonly sides: Readonly<Record<Side, SessionStage | "idle">>;
  /** 仅当两侧 completed 且量测有效时存在。 */
  readonly difference: DifferenceMetrics | null;
  readonly error: {
    readonly side: Side | null;
    readonly stage: SessionStage;
    readonly reason: string;
  } | null;
  readonly display: {
    readonly mode: "split" | "overlay";
    readonly overlayOpacity: number;
    readonly background: "checker" | "white" | "black";
    readonly scale: "fit" | "actual";
  };
}
