/**
 * 外层协调器桩（issue #66）。
 * 负责轮次生命周期、消息核对与共同起跑；由协调票（#71）实现。
 */
import type {
  ControllerState,
  DifferenceMetrics,
  RunnerMessage,
  SessionId,
  Side,
  ViewEvent,
} from "../contracts/index.js";

export interface Coordinator {
  readonly state: ControllerState;
  dispatch(event: ViewEvent): void;
  /** 只接受当前 sessionId/side/来源匹配的消息；旧消息一律拒收。 */
  receive(message: RunnerMessage, source: unknown): void;
  /** 切换/重跑：使旧轮次失效、清空画面指标错误、启动清理。 */
  invalidate(sessionId: SessionId): Promise<void>;
}

export function createCoordinator(): Coordinator {
  throw new Error(
    "not-implemented: 协调器由工具协调票（#71）实现；本票仅冻结接口",
  );
}

export type { DifferenceMetrics, Side };
