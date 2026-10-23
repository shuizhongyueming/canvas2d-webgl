/**
 * 子执行器（iframe 内）桩（issue #66）。
 * 持有 prepared execution 与清理登记；具体 prepare/run 接线由执行票（#69）实现。
 * 保持旧 harness 与正式采集行为：本模块不改变 test/harness/browser.js 的语义。
 */
import type {
  CleanupCallback,
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
  // 每项登记持有独立 slot；注销只移除自己的 slot，不受重复回调影响。
  type Slot = { cleanup: CleanupCallback; active: boolean };
  const slots: Slot[] = [];
  let disposed = false;
  let disposePromise: Promise<void> | null = null;
  return {
    register(cleanup) {
      if (disposed) throw new Error("cleanup-registry: disposed");
      const slot: Slot = { cleanup, active: true };
      slots.push(slot);
      return () => {
        if (!slot.active) return;
        slot.active = false;
        const index = slots.indexOf(slot);
        if (index >= 0) slots.splice(index, 1);
      };
    },
    disposeAll() {
      if (disposePromise) return disposePromise;
      disposed = true;
      disposePromise = (async () => {
        // 逆序释放；单项异常不阻塞其余清理，收集后统一抛出首个错误。
        let first: unknown;
        for (let i = slots.length - 1; i >= 0; i--) {
          const slot = slots[i];
          if (!slot?.active) continue;
          slot.active = false;
          try {
            await slot.cleanup();
          } catch (error) {
            if (first === undefined) first = error;
          }
        }
        slots.length = 0;
        if (first !== undefined) throw first;
      })();
      return disposePromise;
    },
  };
}

export type { PreparedExecution };
