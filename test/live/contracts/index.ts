/** 共同契约统一出口；后续票只能从这里导入，不另建消息或指标模型。 */
export type {
  CleanupCallback,
  CleanupRegistry,
  ControllerMessage,
  ControllerState,
  DifferenceBounds,
  DifferenceMetrics,
  DisplayClassification,
  FeedbackDifference,
  FeedbackReport,
  PixelData,
  PreparedExecution,
  RunnerMessage,
  SessionId,
  SessionStage,
  Side,
  ViewEvent,
} from "./session.js";
export type { LiveToolConfig } from "./config.js";
export { DEFAULT_LIVE_TOOL_CONFIG } from "./config.js";
