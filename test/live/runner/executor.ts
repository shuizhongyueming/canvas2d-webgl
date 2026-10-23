/**
 * iframe 内子执行器（issue #69）。
 * 每个 iframe 文档只承载一侧一轮：加载用例定义 → prepare（含字体与用例
 * 静态素材准备）→ 发 ready → 等外层 start → run → 最终取样 → 发 completed。
 * prepare/start/dispose 任一时刻可收到 dispose；错误按阶段上报 error。
 *
 * 并发纪律：消息事件可并发到达，本类的每个 await 之后都重新核对阶段；
 * prepare 入口立即占用 preparing 标记，重复 prepare 一律报错。
 */
import type {
  CleanupCallback,
  CleanupRegistry,
  ControllerMessage,
  PixelData,
  PreparedExecution,
  RunnerMessage,
  SessionStage,
  Side,
} from "../contracts/index.js";
import type { CaseDefinition } from "../../types/testing.js";
import {
  prepareCaseExecution,
  seededRandomFrom,
  type ExecutionEnvironment,
} from "./execution.js";

export interface RunnerEnvironment {
  /** 向外层页面发送带 sessionId/side 的消息。 */
  postMessage(message: RunnerMessage): void;
}

/** 运行时装配输入；URL 相对 iframe 文档解析。 */
export interface RunnerBootstrap {
  readonly sessionId: string;
  readonly side: Side;
  /** 用例模块 URL（.build 下编译产物，导出 cases）。 */
  readonly caseModuleUrl: string;
  readonly caseId: string;
  /** 兼容库入口 URL（dist/index.js）；native 侧不需要。 */
  readonly libraryUrl: string;
  /** 测试 hooks 模块 URL（dist/gpu/hooks.js）；native 侧不需要。 */
  readonly hooksUrl: string;
  readonly timeouts: { readonly prepare: number; readonly run: number };
  /** 消息出口；测试可注入捕获，浏览器默认 parent.postMessage。 */
  readonly post: (message: RunnerMessage) => void;
}

interface CaseModule {
  readonly cases: readonly CaseDefinition[];
}

interface LibraryModule {
  readonly createCompatCanvas: (target: HTMLCanvasElement) => {
    getContext(kind: "2d"): unknown;
    dispose(): void;
  };
}

interface HooksModule {
  readonly lookupTestHooks: (
    canvas: unknown,
  ) => import("../../types/testing.js").TestHooks | null;
}

function reasonOf(error: unknown): string {
  return String((error as { stack?: unknown })?.stack || error);
}

/** 有限超时；与旧 bounded 语义一致：超时不取消底层任务，只标记失败。 */
function bounded<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function waitFonts(
  fonts: readonly string[],
  deadline: number,
): Promise<void> {
  const remaining = () => Math.max(1, deadline - Date.now());
  try {
    await bounded(
      Promise.all(fonts.map((font) => document.fonts.load(font))),
      remaining(),
      "font-timeout",
    );
    await bounded(document.fonts.ready, remaining(), "font-timeout");
    if (fonts.some((font) => !document.fonts.check(font)))
      throw new Error("font-unavailable");
  } catch (error) {
    throw new Error(`font-not-ready: ${(error as Error).message}`);
  }
}

/**
 * 单轮单侧执行会话。文档级单例：重复 prepare 或 start 乱序直接报错，
 * 保证每个文档只承载一侧一轮。failed 是终态；只有 dispose 能离开。
 */
export class RunnerSession {
  #stage: SessionStage = "preparing";
  #registry: CleanupRegistry;
  #prepared: PreparedExecution | null = null;
  #controller: AbortController | null = null;
  #disposePromise: Promise<void> | null = null;
  /** 入口占锁：并发重复 prepare 在第一个 await 前即被拒绝。 */
  #prepareClaimed = false;
  #caseId: string;

  constructor(
    private readonly bootstrap: RunnerBootstrap,
    private readonly registryFactory: () => CleanupRegistry,
  ) {
    this.#registry = registryFactory();
    this.#caseId = bootstrap.caseId;
  }

  get stage(): SessionStage {
    return this.#stage;
  }

  #post(message: RunnerMessage): void {
    this.bootstrap.post(message);
  }

  /**
   * 阶段上报。默认进入 failed 终态；terminal=false 只发诊断不改阶段，
   * 用于重复 prepare 等调用方错误——不影响正在进行的合法 prepare。
   * disposing/disposed 后不再改状态。
   */
  #fail(stage: SessionStage, error: unknown, terminal = true): void {
    if (this.#stage === "disposed" || this.#stage === "disposing") return;
    if (terminal) this.#stage = "failed";
    this.#post({
      type: "error",
      sessionId: this.bootstrap.sessionId,
      side: this.bootstrap.side,
      stage,
      reason: reasonOf(error),
    });
  }

  /** await 之后的阶段守卫：dispose/failed 之后不得继续装配或发 ready。 */
  #assertAlive(): void {
    if (this.#stage !== "preparing")
      throw new Error(`session no longer active: ${this.#stage}`);
  }

  /** 处理外层控制消息；轮次/侧别/caseId 不匹配或乱序均被拒绝。 */
  async handle(message: ControllerMessage): Promise<void> {
    try {
      if (message.sessionId !== this.bootstrap.sessionId) return;
      if (message.side !== this.bootstrap.side) return;
      switch (message.type) {
        case "prepare":
          if (message.caseId !== this.#caseId) {
            this.#fail(
              "preparing",
              new Error(
                `case-mismatch: expected ${this.#caseId}, got ${message.caseId}`,
              ),
            );
            return;
          }
          await this.#prepare();
          break;
        case "start":
          await this.#start();
          break;
        case "dispose":
          await this.dispose();
          break;
      }
    } catch (error) {
      // handle 不向调用方抛错；异步路径的错误统一按阶段上报。
      this.#fail(this.#stage, error);
    }
  }

  async #prepare(): Promise<void> {
    // 入口占锁放在任何 await 之前：并发重复 prepare 一律报错。
    if (this.#prepareClaimed) {
      this.#fail(this.#stage, new Error("duplicate prepare"), false);
      return;
    }
    this.#prepareClaimed = true;
    if (this.#stage !== "preparing") {
      this.#fail(this.#stage, new Error("prepare-after-terminal"));
      return;
    }
    const deadline = Date.now() + this.bootstrap.timeouts.prepare;
    const remaining = () => Math.max(1, deadline - Date.now());
    try {
      const [caseModule, library, hooksModule] = (await bounded(
        Promise.all([
          import(this.bootstrap.caseModuleUrl) as Promise<CaseModule>,
          this.bootstrap.side === "compat"
            ? (import(this.bootstrap.libraryUrl) as Promise<LibraryModule>)
            : Promise.resolve(null),
          this.bootstrap.side === "compat"
            ? (import(this.bootstrap.hooksUrl) as Promise<HooksModule>)
            : Promise.resolve(null),
        ]),
        remaining(),
        "prepare-timeout",
      )) as [CaseModule, LibraryModule | null, HooksModule | null];
      this.#assertAlive();

      const definition = caseModule.cases.find(
        (entry) => entry.id === this.#caseId,
      );
      if (!definition) throw new Error(`case-not-found: ${this.#caseId}`);

      // 显式准备：字体与普通静态素材在 prepare 完成；run 内仍保留测试
      // 行为自身的加载状态/来源修改。整个 prepare 阶段共用同一 deadline。
      await waitFonts(definition.fonts, deadline);
      this.#assertAlive();

      const environment: ExecutionEnvironment = {
        side: this.bootstrap.side,
        seededRandom: seededRandomFrom(definition.seed),
        targetParent: document.body,
        createCompatCanvas: library?.createCompatCanvas ?? null,
        lookupTestHooks: hooksModule?.lookupTestHooks ?? null,
        fail: (stage, error) => this.#fail(stage, error),
      };
      const { execution: prepared, adapter } = prepareCaseExecution(
        definition,
        environment,
        this.#registry,
      );

      // 用例级 prepare 扩展（issue #63）：加载用例声明的静态素材并返回
      // prepared execution 供外层统一 start。其 run/readPixels 是正式执行
      // 入口；dispose 链接到本轮清理。没有用例 prepare 时以环境装配为准。
      let execution = prepared;
      if (definition.prepare) {
        const casePrepared = await bounded(
          Promise.resolve(definition.prepare(adapter, this.#registry)),
          remaining(),
          "prepare-timeout",
        );
        this.#assertAlive();
        // 环境装配的 dispose 只释放登记资源；用例 execution 接管 run/readPixels。
        execution = {
          run: (signal) => casePrepared.run(signal),
          readPixels: () => casePrepared.readPixels(),
          dispose: () => prepared.dispose(),
        };
      }

      this.#prepared = execution;
      this.#controller = new AbortController();
      this.#stage = "ready";
      this.#post({
        type: "ready",
        sessionId: this.bootstrap.sessionId,
        side: this.bootstrap.side,
      });
    } catch (error) {
      // disposing/disposed 期间由 dispose 负责；这里只覆盖活动阶段失败。
      // 显式读取到局部变量，绕过 TS 对私有字段在闭包内缩窄的误报。
      const stage = this.#readStage();
      if (stage !== "disposing" && stage !== "disposed") {
        this.#fail("preparing", error);
        await this.dispose();
      }
    }
  }

  #readStage(): SessionStage {
    return this.#stage;
  }

  async #start(): Promise<void> {
    if (this.#stage !== "ready" || !this.#prepared || !this.#controller) {
      // failed 是终态：不报第二个 error，也不允许恢复。
      if (this.#stage !== "failed")
        this.#fail(this.#stage, new Error("start-before-ready"));
      return;
    }
    this.#stage = "running";
    const prepared = this.#prepared;
    const signal = this.#controller.signal;
    try {
      await bounded(
        prepared.run(signal),
        this.bootstrap.timeouts.run,
        "run-timeout",
      );
      if (this.#stage !== "running") return; // 中途进入 disposing/failed
      const pixels: PixelData = prepared.readPixels();
      if (this.#stage !== "running") return;
      this.#stage = "completed";
      this.#post({
        type: "completed",
        sessionId: this.bootstrap.sessionId,
        side: this.bootstrap.side,
        pixels,
      });
    } catch (error) {
      if (this.#stage === "running") {
        this.#fail("running", error);
        await this.dispose();
      }
    }
  }

  /**
   * 幂等清理：中断 run（尽力）、执行清理登记、移除目标；不无限阻塞。
   * 清理回调抛错时仍然进入 disposed 并上报首个错误；并发调用共享同一 Promise。
   */
  dispose(): Promise<void> {
    if (this.#disposePromise) return this.#disposePromise;
    this.#stage = "disposing";
    this.#controller?.abort();
    const cleanupError: { value: unknown } = { value: undefined };
    this.#disposePromise = (async () => {
      try {
        await this.#prepared?.dispose();
      } catch (error) {
        cleanupError.value = error;
      }
      try {
        await this.#registry.disposeAll();
      } catch (error) {
        if (cleanupError.value === undefined) cleanupError.value = error;
      }
      this.#stage = "disposed";
      if (cleanupError.value !== undefined)
        this.#post({
          type: "error",
          sessionId: this.bootstrap.sessionId,
          side: this.bootstrap.side,
          stage: "disposing",
          reason: reasonOf(cleanupError.value),
        });
    })();
    return this.#disposePromise;
  }
}

/**
 * 创建空清理登记；满足契约票冻结语义（逆序、幂等、并发共享结果）。
 * 扩展：disposing 期间登记的清理立即执行并计入本轮，避免 await 竞态
 * 把已创建资源留在登记之外。
 */
export function createCleanupRegistry(): CleanupRegistry {
  // 每项登记持有独立 slot；注销只移除自己的 slot，不受重复回调影响。
  type Slot = { cleanup: CleanupCallback; active: boolean };
  const slots: Slot[] = [];
  const lateErrors: unknown[] = [];
  let disposed = false;
  let disposing = false;
  let disposePromise: Promise<void> | null = null;
  const runCleanup = async (slot: Slot): Promise<void> => {
    if (!slot.active) return;
    slot.active = false;
    await slot.cleanup();
  };
  return {
    register(cleanup) {
      const slot: Slot = { cleanup, active: true };
      if (disposing && !disposed) {
        // disposing 期间登记：立即执行，不让资源逃出清理。
        void runCleanup(slot).catch((error) => lateErrors.push(error));
        return () => {
          slot.active = false;
        };
      }
      if (disposed) throw new Error("cleanup-registry: disposed");
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
      disposing = true;
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
        disposed = true;
        // disposing 期间登记的清理若失败，一并纳入首个错误。
        if (first === undefined && lateErrors.length) first = lateErrors[0];
        if (first !== undefined) throw first;
      })();
      return disposePromise;
    },
  };
}

/**
 * iframe runner 文档入口：装配会话并把外层 window message 路由进来。
 * 由 runner.html（协调票页面骨架之外的执行文档）调用。
 */
export function installRunnerWindow(
  win: Window,
  bootstrap: RunnerBootstrap,
  registryFactory: () => CleanupRegistry = createCleanupRegistry,
): RunnerSession {
  const session = new RunnerSession(bootstrap, registryFactory);
  win.addEventListener("message", (event: MessageEvent) => {
    const message = event.data as ControllerMessage | null;
    if (!message || typeof message !== "object") return;
    if (message.sessionId !== bootstrap.sessionId) return;
    if (message.side !== bootstrap.side) return;
    // handle 内部吸收错误并按阶段上报；不产生 unhandled rejection。
    void session.handle(message);
  });
  return session;
}
