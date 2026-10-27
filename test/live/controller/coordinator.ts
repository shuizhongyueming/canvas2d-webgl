/** 父页面轮次协调器（issue #71）。每个轮次拥有两个独立 iframe。 */
import type {
  ControllerState,
  DifferenceMetrics,
  FeedbackReport,
  PixelData,
  RunnerMessage,
  SessionId,
  SessionStage,
  Side,
  ViewEvent,
} from "../contracts/index.js";
import { measurePixelDifference } from "../measure/diff-core.js";
import {
  serializeFailedFeedback,
  serializeMeasuredFeedback,
  type BrowserInfo,
} from "../measure/feedback.js";

const SIDES = ["native", "compat"] as const;

export interface RunnerFrame {
  readonly element: HTMLIFrameElement;
  post(message: import("../contracts/index.js").ControllerMessage): void;
}

export interface CoordinatorOptions {
  readonly cases: readonly { readonly id: string }[];
  readonly timeouts: { readonly prepare: number; readonly run: number };
  readonly createFrame: (
    sessionId: SessionId,
    side: Side,
    caseId: string,
  ) => RunnerFrame;
  readonly measure?: (
    native: PixelData,
    compat: PixelData,
  ) => DifferenceMetrics;
  readonly browserInfo?: () => BrowserInfo;
  readonly onChange?: (state: ControllerState) => void;
  readonly cleanupTimeout?: number;
}

export interface Coordinator {
  readonly state: ControllerState;
  dispatch(event: ViewEvent): void;
  receive(message: RunnerMessage, source: unknown): void;
  invalidate(sessionId: SessionId): Promise<void>;
  attachCanvas(slot: HTMLElement, side: Side): void;
  feedback(): FeedbackReport | null;
  dispose(): Promise<void>;
}

interface SideRun {
  readonly frame: RunnerFrame;
  stage: SessionStage;
  pixels: PixelData | null;
}

interface Run {
  readonly id: SessionId;
  readonly caseId: string;
  readonly sides: Record<Side, SideRun>;
  timer: ReturnType<typeof setTimeout> | null;
  difference: DifferenceMetrics | null;
  error: ControllerState["error"];
  failed: boolean;
  disposed: boolean;
  cleanup: Promise<void> | null;
}

function reasonOf(error: unknown): string {
  return String((error as { stack?: unknown })?.stack || error);
}

function defaultMeasure(
  native: PixelData,
  compat: PixelData,
): DifferenceMetrics {
  const result = measurePixelDifference(native, compat);
  if (result.status === "invalid")
    throw new Error(`measurement-failed: ${result.reason}`);
  return result.metrics;
}

function assertTimeout(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError(`${name} timeout must be positive`);
}

/** 构造时不启动；dispatch(select-case/rerun) 明确启动一轮。 */
export function createCoordinator(options: CoordinatorOptions): Coordinator {
  assertTimeout(options.timeouts.prepare, "prepare");
  assertTimeout(options.timeouts.run, "run");
  assertTimeout(options.cleanupTimeout ?? 1000, "cleanup");
  const caseIds = new Set(options.cases.map((entry) => entry.id));
  const slots: Partial<Record<Side, HTMLElement>> = {};
  const cleanupDiagnostics = new Map<string, string[]>();
  const cleanupSources = new Map<string, Record<Side, unknown>>();
  let current: Run | null = null;
  let disposed = false;
  let nextId = 0;
  let state: ControllerState = {
    sessionId: null,
    caseId: null,
    stage: "idle",
    sides: { native: "idle", compat: "idle" },
    difference: null,
    error: null,
    display: {
      mode: "overlay",
      overlayOpacity: 0.5,
      background: "checker",
      scale: "fit",
    },
  };

  const publish = (): void => {
    options.onChange?.(state);
  };

  const update = (run: Run): void => {
    if (current !== run || disposed) return;
    const overall: SessionStage = run.failed
      ? "failed"
      : SIDES.every((side) => run.sides[side].stage === "completed")
        ? "completed"
        : SIDES.some((side) => run.sides[side].stage === "running")
          ? "running"
          : SIDES.every((side) => run.sides[side].stage === "ready")
            ? "ready"
            : "preparing";
    state = {
      ...state,
      sessionId: run.id,
      caseId: run.caseId,
      stage: overall,
      sides: {
        native: run.sides.native.stage,
        compat: run.sides.compat.stage,
      },
      difference: run.difference,
      error: run.error,
    };
    publish();
  };

  const stopTimer = (run: Run): void => {
    if (run.timer !== null) clearTimeout(run.timer);
    run.timer = null;
  };

  const cleanup = (run: Run): Promise<void> => {
    if (run.cleanup) return run.cleanup;
    run.disposed = true;
    stopTimer(run);
    run.sides.native.pixels = null;
    run.sides.compat.pixels = null;
    run.difference = null;
    // 先请求子执行器显式释放，再移除文档。此处不等待旧 run 收尾。
    for (const side of SIDES) {
      const item = run.sides[side];
      item.stage = "disposing";
      // 不移动 iframe 的 DOM 祖先。移动可能重载文档并绕过显式清理。
      item.frame.element.style.visibility = "hidden";
      item.frame.element.style.pointerEvents = "none";
      try {
        item.frame.post({ type: "dispose", sessionId: run.id, side });
      } catch {
        // 移除 iframe 仍是不可响应环境的兜底。
      }
    }
    cleanupDiagnostics.set(run.id, []);
    cleanupSources.set(run.id, {
      native: run.sides.native.frame.element.contentWindow,
      compat: run.sides.compat.frame.element.contentWindow,
    });
    run.cleanup = new Promise<void>((resolve) => {
      setTimeout(resolve, options.cleanupTimeout ?? 1000);
    }).finally(() => {
      const diagnostics = cleanupDiagnostics.get(run.id);
      cleanupDiagnostics.delete(run.id);
      cleanupSources.delete(run.id);
      for (const side of SIDES) {
        run.sides[side].stage = "disposed";
        run.sides[side].frame.element.remove();
      }
      if (current === run && diagnostics?.length && run.error) {
        run.error = {
          ...run.error,
          reason: `${run.error.reason}; cleanup: ${diagnostics.join("; ")}`,
        };
        update(run);
      }
    });
    return run.cleanup;
  };

  function fail(
    run: Run,
    side: Side | null,
    stage: SessionStage,
    reason: string,
  ): void {
    if (run.failed || run.disposed) return;
    run.failed = true;
    run.error = { side, stage, reason };
    run.difference = null;
    update(run);
    void cleanup(run);
  }

  const start = (run: Run): void => {
    if (current !== run || run.failed || run.disposed) return;
    stopTimer(run);
    for (const side of SIDES) {
      const item = run.sides[side];
      item.stage = "running";
      item.frame.post({ type: "start", sessionId: run.id, side });
    }
    update(run);
    run.timer = setTimeout(() => {
      if (current === run && !run.failed && !run.disposed)
        fail(run, null, "running", "run-timeout");
    }, options.timeouts.run);
  };

  const begin = (caseId: string): void => {
    if (disposed) return;
    if (!caseIds.has(caseId))
      throw new Error(`case-not-displayable: ${caseId}`);
    const old = current;
    current = null;
    if (old) {
      old.failed = true;
      void cleanup(old);
    }
    const id = `live-${Date.now().toString(36)}-${++nextId}`;
    const sides = {} as Record<Side, SideRun>;
    const run: Run = {
      id,
      caseId,
      sides,
      timer: null,
      difference: null,
      error: null,
      failed: false,
      disposed: false,
      cleanup: null,
    };
    current = run;
    // 在创建新帧前发布空状态。视图和插槽不会保留旧画面。
    state = {
      ...state,
      sessionId: id,
      caseId,
      stage: "preparing",
      sides: { native: "preparing", compat: "preparing" },
      difference: null,
      error: null,
    };
    for (const side of SIDES) {
      const frame = options.createFrame(id, side, caseId);
      frame.element.tabIndex = -1;
      frame.element.style.pointerEvents = "none";
      frame.element.style.border = "0";
      frame.element.style.display = "block";
      frame.element.setAttribute("aria-label", `${side} live runner`);
      sides[side] = { frame, stage: "preparing", pixels: null };
      const host = document.createElement("div");
      host.dataset.sessionId = id;
      host.style.display = "contents";
      host.append(frame.element);
      slots[side]?.append(host);
    }
    publish();
    try {
      for (const side of SIDES)
        sides[side].frame.post({
          type: "prepare",
          sessionId: id,
          side,
          caseId,
        });
    } catch (error) {
      fail(run, null, "preparing", reasonOf(error));
      return;
    }
    run.timer = setTimeout(() => {
      if (current === run && !run.failed && !run.disposed)
        fail(run, null, "preparing", "prepare-timeout");
    }, options.timeouts.prepare);
  };

  function receive(message: RunnerMessage, source: unknown): void {
    if (!message || typeof message !== "object") return;
    // 清理诊断可来自已失效轮次；其余晚到消息一律拒收。
    if (
      message.type === "error" &&
      message.stage === "disposing" &&
      cleanupDiagnostics.has(message.sessionId) &&
      (message.side === "native" || message.side === "compat")
    ) {
      if (cleanupSources.get(message.sessionId)?.[message.side] === source)
        cleanupDiagnostics.get(message.sessionId)?.push(message.reason);
      return;
    }
    const run = current;
    if (
      !run ||
      run.failed ||
      run.disposed ||
      message.sessionId !== run.id ||
      (message.side !== "native" && message.side !== "compat")
    )
      return;
    const item = run.sides[message.side];
    if (source !== item.frame.element.contentWindow) return;
    if (message.type === "error") {
      fail(run, message.side, message.stage, message.reason);
      return;
    }
    if (message.type === "ready") {
      if (item.stage !== "preparing") return;
      item.stage = "ready";
      update(run);
      if (SIDES.every((side) => run.sides[side].stage === "ready")) start(run);
      return;
    }
    if (message.type === "completed") {
      if (item.stage !== "running" || item.pixels) return;
      item.pixels = message.pixels;
      item.stage = "completed";
      if (!SIDES.every((side) => run.sides[side].stage === "completed")) {
        update(run);
        return;
      }
      stopTimer(run);
      try {
        run.difference = (options.measure ?? defaultMeasure)(
          run.sides.native.pixels as PixelData,
          run.sides.compat.pixels as PixelData,
        );
        update(run);
      } catch (error) {
        fail(run, null, "running", reasonOf(error));
      }
    }
  }

  const coordinator: Coordinator = {
    get state() {
      return state;
    },
    dispatch(event) {
      if (disposed) return;
      switch (event.type) {
        case "select-case":
          if (event.caseId !== state.caseId || state.stage === "failed")
            begin(event.caseId);
          break;
        case "step-case": {
          const index = options.cases.findIndex(
            (entry) => entry.id === state.caseId,
          );
          const entry = options.cases[index + event.direction];
          if (entry) begin(entry.id);
          break;
        }
        case "rerun":
          if (state.caseId) begin(state.caseId);
          break;
        case "set-display-mode":
          state = { ...state, display: { ...state.display, mode: event.mode } };
          publish();
          break;
        case "set-overlay-opacity":
          state = {
            ...state,
            display: {
              ...state.display,
              overlayOpacity: Math.min(1, Math.max(0, event.opacity)),
            },
          };
          publish();
          break;
        case "set-background":
          state = {
            ...state,
            display: { ...state.display, background: event.background },
          };
          publish();
          break;
        case "set-scale":
          state = {
            ...state,
            display: { ...state.display, scale: event.scale },
          };
          publish();
          break;
        case "copy-case-id":
        case "copy-feedback":
          break;
      }
    },
    receive,
    invalidate(sessionId) {
      if (!current || current.id !== sessionId) return Promise.resolve();
      const run = current;
      current = null;
      run.failed = true;
      state = {
        ...state,
        sessionId: null,
        stage: "idle",
        sides: { native: "idle", compat: "idle" },
        difference: null,
        error: null,
      };
      publish();
      return cleanup(run);
    },
    attachCanvas(slot, side) {
      slots[side] = slot;
      slot.replaceChildren();
      if (current && !current.failed && !current.disposed)
        slot.append(current.sides[side].frame.element);
    },
    feedback() {
      const run = current;
      if (!run || disposed) return null;
      const browser = options.browserInfo?.() ?? {
        userAgent: "unknown",
        language: "unknown",
        devicePixelRatio: 1,
      };
      if (run.failed && run.error)
        return serializeFailedFeedback({
          caseId: run.caseId,
          browser,
          side: run.error.side,
          stage: run.error.stage,
          reason: run.error.reason,
        });
      if (
        state.stage === "completed" &&
        run.difference &&
        run.sides.native.pixels &&
        run.sides.compat.pixels
      )
        return serializeMeasuredFeedback({
          caseId: run.caseId,
          browser,
          metrics: run.difference,
          nativeSize: run.sides.native.pixels,
          compatSize: run.sides.compat.pixels,
        });
      return null;
    },
    dispose() {
      if (!current) {
        disposed = true;
        return Promise.resolve();
      }
      const promise = coordinator.invalidate(current.id);
      disposed = true;
      return promise;
    },
  };
  return coordinator;
}

export type { DifferenceMetrics, Side };
