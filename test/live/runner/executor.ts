/**
 * 子执行器（iframe 内）桩（issue #66）。
 * 持有 prepared execution 与清理登记；具体 prepare/run 接线由执行票（#69）实现。
 * 保持旧 harness 与正式采集行为：本模块不改变 test/harness/browser.js 的语义。
 */
import type {
  CleanupRegistry,
  ControllerMessage,
  PreparedExecution,
  RunnerMessage,
} from "../contracts/index.js";

export interface RunnerEnvironment {
  /** 向外层页面发送带 sessionId/side 的消息。 */
  postMessage(message: RunnerMessage): void;
}

/** 处理外层控制消息；未实现阶段抛出，不冒充成功。 */
export function handleControllerMessage(
  _message: ControllerMessage,
  _environment: RunnerEnvironment,
): void {
  throw new Error(
    "not-implemented: runner 消息循环由工具执行票（#69）实现；本票仅冻结接口",
  );
}

/** 创建空清理登记；实现满足幂等与逆序释放约定。 */
export function createCleanupRegistry(): CleanupRegistry {
  const callbacks: (() => void | Promise<void>)[] = [];
  let disposed = false;
  return {
    register(cleanup) {
      if (disposed) throw new Error("cleanup-registry: disposed");
      let active = true;
      callbacks.push(cleanup);
      return () => {
        if (!active) return;
        active = false;
        const index = callbacks.indexOf(cleanup);
        if (index >= 0) callbacks.splice(index, 1);
      };
    },
    async disposeAll() {
      if (disposed) return;
      disposed = true;
      // 逆序释放；单项异常不阻塞其余清理，收集后统一抛出首个错误。
      let first: unknown;
      for (let i = callbacks.length - 1; i >= 0; i--) {
        try {
          await callbacks[i]?.();
        } catch (error) {
          if (first === undefined) first = error;
        }
      }
      callbacks.length = 0;
      if (first !== undefined) throw first;
    },
  };
}

export type { PreparedExecution };
