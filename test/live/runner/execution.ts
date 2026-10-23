/**
 * 用例级 prepared execution（issue #69）。
 * 把旧 harness execute 的测试内部能力拆为准备、运行、最终取样与清理。
 * 复用用例定义自身，不形成第二套语义；旧 execute/driver 行为不变。
 *
 * 归执行票所有的装配职责：替换全局随机源（env.seededRandom）、
 * 创建目标 canvas 与 context、用例结束后等待最终呈现、最终取样。
 */
import type {
  CleanupRegistry,
  PixelData,
  PreparedExecution,
  SessionStage,
} from "../contracts/index.js";
import type {
  CaseAdapter,
  CaseDefinition,
  TestHooks,
} from "../../types/testing.js";

/** 单侧执行环境；由 iframe 执行器装配后传入。 */
export interface ExecutionEnvironment {
  readonly side: "native" | "compat";
  /** 隔离的每轮 PRNG；同时用于替换 document 的 Math.random。 */
  readonly seededRandom: () => number;
  /** 画布容器（iframe document.body）；目标 canvas 追加于此并登记移除。 */
  readonly targetParent: HTMLElement;
  /** 兼容侧的工厂；native 侧可为 null。 */
  readonly createCompatCanvas:
    | ((target: HTMLCanvasElement) => {
        getContext(kind: "2d"): unknown;
        dispose(): void;
      })
    | null;
  /**
   * 兼容侧测试 hooks 查询（readScene/whenPresented/resourceCounts）。
   * 由 iframe 执行器从 dist 模块动态解析后注入；native 侧可为 null。
   */
  readonly lookupTestHooks: ((canvas: unknown) => TestHooks | null) | null;
  /** 阶段上报；准备/运行/取样错误按阶段区分。 */
  readonly fail: (stage: SessionStage, error: unknown) => void;
}

interface CompatLike {
  getContext(kind: "2d"): unknown;
  dispose(): void;
}

/** 同输入种子的 PRNG；与旧 execute 的序列完全一致。 */
export function seededRandomFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** 目标 canvas 上最终原始像素；取样错误由调用方带阶段上报。 */
export function readFinalPixels(
  target: HTMLCanvasElement,
  context: CanvasRenderingContext2D | null,
  hooks: TestHooks | null,
): PixelData {
  // 兼容侧走内部 readScene（sRGB RGBA8、非预乘、左上起、alpha=0 时 RGB 归零），
  // 原生侧用 getImageData（同约定由既有设施保证），不读取页面合成结果。
  const sample = hooks
    ? hooks.readScene()
    : (() => {
        if (!context) throw new Error("native 2d context unavailable");
        const image = context.getImageData(0, 0, target.width, target.height);
        return {
          width: image.width,
          height: image.height,
          pixels: image.data,
        };
      })();
  const { width, height } = sample;
  const pixels = sample.pixels;
  if (
    !(Number.isInteger(width) && width > 0) ||
    !(Number.isInteger(height) && height > 0) ||
    pixels.length !== width * height * 4
  )
    throw new Error("invalid-scene-sample");
  return { width, height, pixels: new Uint8Array(pixels) };
}

/**
 * 从 execute 拆出的可复用 prepare。
 * 创建目标与 context、登记目标/兼容实例的清理，返回 PreparedExecution。
 * 字体与用例静态素材的准备由执行器（executor.ts）与用例 prepare 扩展负责；
 * 本函数只承担环境装配，不给用例包空 prepare。
 */
export function prepareCaseExecution(
  definition: CaseDefinition,
  environment: ExecutionEnvironment,
  registry: CleanupRegistry,
): { execution: PreparedExecution; adapter: CaseAdapter } {
  const { side, targetParent, createCompatCanvas, lookupTestHooks, fail } =
    environment;
  // 隔离全局随机源：本轮 document 的 Math.random 指向本侧 PRNG。
  // iframe 每轮新建，无需恢复；重复 prepare 同 document 属于错误用法。
  Math.random = environment.seededRandom;

  const target = document.createElement("canvas");
  target.id = "target";
  target.width = definition.width;
  target.height = definition.height;
  target.style.cssText = "display:block;";
  targetParent.append(target);
  registry.register(() => {
    target.remove();
  });

  let context: CanvasRenderingContext2D | null = null;
  let hooks: TestHooks | null = null;
  let compat: CompatLike | null = null;
  let canvas: HTMLCanvasElement | CompatLike = target;

  if (side === "native") {
    context = target.getContext("2d");
  } else {
    if (!createCompatCanvas)
      throw new Error("compat side requires createCompatCanvas");
    compat = createCompatCanvas(target);
    canvas = compat;
    context = compat.getContext("2d") as CanvasRenderingContext2D;
    if (!target.getContext("webgl"))
      throw new Error("Compatibility target is not bound to WebGL 1");
    if (!lookupTestHooks)
      throw new Error("compat side requires lookupTestHooks");
    const found = lookupTestHooks(compat);
    if (!found) throw new Error("GPU test hooks are not registered");
    hooks = found;
    registry.register(() => {
      compat?.dispose();
    });
  }
  if (!context) throw new Error("2d-unavailable");

  const settledContext = context;
  const settledHooks = hooks;
  const adapter: CaseAdapter = {
    canvas: canvas as CaseAdapter["canvas"],
    context: settledContext as CaseAdapter["context"],
    random: environment.seededRandom,
    assert(value: unknown, message = "assertion failed") {
      if (!value) throw new Error(message);
    },
    observe(key: string, value: unknown) {
      void key;
      void value;
    },
    skip(reason: string): never {
      const error = new Error(`skip: ${reason}`);
      (error as { code?: string }).code = "harness-blocked";
      throw error;
    },
    async checkpoint() {
      if (settledHooks) {
        const { generation } = settledHooks.readScene();
        await settledHooks.whenPresented(generation);
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    },
  };

  let running = false;
  let sampled: PixelData | null = null;
  let disposePromise: Promise<void> | null = null;

  return {
    adapter,
    execution: {
      async run(signal: AbortSignal) {
        if (running) throw new Error("execution already started");
        running = true;
        if (signal.aborted) throw new Error("aborted");
        try {
          await Promise.resolve().then(() => definition.run(adapter));
          // 用例结束后等待最后一次渲染提交；completed 以取样为准而非 run 返回。
          await adapter.checkpoint();
        } catch (error) {
          fail("running", error);
          throw error;
        }
        try {
          sampled = readFinalPixels(target, settledContext, settledHooks);
        } catch (error) {
          fail("running", error);
          throw error;
        }
        // 成功后保留主画布直到 dispose；完成后不再绘制由用例语义保证。
        if (signal.aborted) throw new Error("aborted");
      },
      readPixels() {
        if (!sampled) throw new Error("pixels read before run completed");
        return sampled;
      },
      dispose() {
        if (!disposePromise) disposePromise = registry.disposeAll();
        return disposePromise;
      },
    },
  };
}
