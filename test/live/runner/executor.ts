/**
 * iframe 内子执行器（issue #69）。
 * 每个 iframe 文档只承载一侧一轮：加载用例定义 → prepare（含字体与用例
 * 静态素材准备）→ 发 ready → 等外层 start → run → 最终取样 → 发 completed。
 * prepare/start/dispose 任一时刻可收到 dispose；错误按阶段上报 error。
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
  timeout: number,
): Promise<void> {
  try {
    await bounded(
      Promise.all(fonts.map((font) => document.fonts.load(font))),
      timeout,
      "font-timeout",
    );
    await bounded(document.fonts.ready, timeout, "font-timeout");
    if (fonts.some((font) => !document.fonts.check(font)))
      throw new Error("font-unavailable");
  } catch (error) {
    throw new Error(`font-not-ready: ${(error as Error).message}`);
  }
}

/**
 * 单轮单侧执行会话。文档级单例：重复 prepare 或 start 乱序直接报错，
 * 保证每个文档只承载一侧一轮。
 */
export class RunnerSession {
  #stage: SessionStage = "preparing";
  #registry: CleanupRegistry;
  #prepared: PreparedExecution | null = null;
  #controller: AbortController | null = null;
  #disposePromise: Promise<void> | null = null;

  constructor(
    private readonly bootstrap: RunnerBootstrap,
    private readonly registryFactory: () => CleanupRegistry,
  ) {
    this.#registry = registryFactory();
  }

  get stage(): SessionStage {
    return this.#stage;
  }

  #post(message: RunnerMessage): void {
    this.bootstrap.post(message);
  }

  #fail(stage: SessionStage, error: unknown): void {
    if (this.#stage === "disposed" || this.#stage === "disposing") return;
    this.#stage = "failed";
    this.#post({
      type: "error",
      sessionId: this.bootstrap.sessionId,
      side: this.bootstrap.side,
      stage,
      reason: reasonOf(error),
    });
  }

  /** 处理外层控制消息；未知类型或轮次/侧别不匹配在类型层已排除，运行时仍核对。 */
  async handle(message: ControllerMessage): Promise<void> {
    if (message.sessionId !== this.bootstrap.sessionId) return;
    if (message.side !== this.bootstrap.side) return;
    switch (message.type) {
      case "prepare":
        await this.#prepare();
        break;
      case "start":
        await this.#start();
        break;
      case "dispose":
        await this.dispose();
        break;
    }
  }

  async #prepare(): Promise<void> {
    if (this.#stage !== "preparing" || this.#prepared) {
      this.#fail(this.#stage, new Error("duplicate prepare"));
      return;
    }
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
        this.bootstrap.timeouts.prepare,
        "prepare-timeout",
      )) as [CaseModule, LibraryModule | null, HooksModule | null];

      const definition = caseModule.cases.find(
        (entry) => entry.id === this.bootstrap.caseId,
      );
      if (!definition)
        throw new Error(`case-not-found: ${this.bootstrap.caseId}`);

      // 显式准备：字体与普通静态素材在 prepare 完成；run 内仍保留测试
      // 行为自身的加载状态/来源修改。
      await waitFonts(definition.fonts, this.bootstrap.timeouts.prepare);

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

      // 用例级 prepare 扩展：加载用例声明的静态素材，登记其拥有的资源。
      // 用例 prepare 复用同一 adapter/registry；其返回的 PreparedExecution
      // 只链接 dispose（资源释放归用例），run/readPixels 始终以环境装配为准。
      let casePrepared: PreparedExecution | null = null;
      if (definition.prepare) {
        casePrepared = await bounded(
          Promise.resolve(definition.prepare(adapter, this.#registry)),
          this.bootstrap.timeouts.prepare,
          "prepare-timeout",
        );
      }
      if (casePrepared) {
        const inner = casePrepared;
        this.#registry.register(() => inner.dispose());
      }

      this.#prepared = prepared;
      this.#controller = new AbortController();
      this.#stage = "ready";
      this.#post({
        type: "ready",
        sessionId: this.bootstrap.sessionId,
        side: this.bootstrap.side,
      });
    } catch (error) {
      this.#fail("preparing", error);
      await this.dispose();
    }
  }

  async #start(): Promise<void> {
    if (this.#stage !== "ready" || !this.#prepared || !this.#controller) {
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
      const pixels: PixelData = prepared.readPixels();
      if (this.#stage !== "running") return; // 中途进入 disposing/failed
      this.#stage = "completed";
      this.#post({
        type: "completed",
        sessionId: this.bootstrap.sessionId,
        side: this.bootstrap.side,
        pixels,
      });
    } catch (error) {
      if (this.#stage === "running") this.#fail("running", error);
      await this.dispose();
    }
  }

  /** 幂等清理：中断 run（尽力）、执行清理登记、移除目标；不无限阻塞。 */
  async dispose(): Promise<void> {
    if (this.#stage === "disposed")
      return this.#disposePromise ?? Promise.resolve();
    if (this.#disposePromise) return this.#disposePromise;
    this.#stage = "disposing";
    this.#controller?.abort();
    this.#disposePromise = (async () => {
      try {
        await this.#prepared?.dispose();
      } finally {
        await this.#registry.disposeAll();
        this.#stage = "disposed";
      }
    })();
    return this.#disposePromise;
  }
}

/** 创建空清理登记；满足幂等与逆序释放约定（契约票冻结语义）。 */
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
    void session.handle(message);
  });
  return session;
}
