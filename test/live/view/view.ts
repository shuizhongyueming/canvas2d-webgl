/**
 * 视图层实现（issue #70）。
 * 负责用例导航、分屏/重叠显示、背景与显示比例切换、差异与错误展示、
 * 反馈复制。只消费冻结契约与注入的 dispatch/剪贴板/时钟，不实现执行、
 * 量测或协调逻辑；真实画布由控制器挂载到本模块暴露的插槽中。
 */
import type {
  ControllerState,
  DifferenceMetrics,
  FeedbackReport,
  SessionStage,
  Side,
  ViewEvent,
} from "../contracts/index.js";

export interface View {
  /** 释放父页面持有的 observer 与计时器；不销毁当前执行轮次。 */
  dispose(): void;
  render(state: ControllerState): void;
  /**
   * 页面级快捷键在控件聚焦期间不得触发（issue #60 键盘冲突）。
   * 焦点策略：由外层页面把 document 的 keydown 转交本方法；iframe 内的
   * 键盘事件属于子执行环境，不经过外层 document，因此 iframe 内操作
   * 不会被页面级快捷键拦截；集成票（#71）负责接线并在集成中验证。
   */
  handleKey(key: string): void;
  shouldHandleKey(key: string): boolean;
  /**
   * 复制反馈上下文（issue #64 反馈协议）。
   * 调用协议：用户点击按钮只派发 copy-feedback 事件；controller 收到后
   * 仅在终态（completed/failed）用协调器生成的完整报告调用本方法。
   * 本方法在非终态或无当前轮次时拒绝并返回 false，不复制旧数据。
   */
  copyFeedback(report: FeedbackReport): Promise<boolean>;
  /**
   * 复制当前用例 ID。调用协议同 copyFeedback：按钮派发 copy-case-id，
   * controller 收到后调用本方法；复制 ID 在任何有选中用例时可用。
   */
  copyCaseId(): Promise<boolean>;
}

/** 控制器注入的宿主环境；真实浏览器默认实现见 createBrowserHost。 */
export interface ViewHost {
  /** 通知 controller 某个插槽需要（重新）挂载对应侧的真实画布。 */
  attachCanvas(slot: HTMLElement, side: Side): void;
  /** 复制文本；失败时 reject，视图负责提示。 */
  copyText(text: string): Promise<void>;
  /** 读取浏览器信息，仅用于反馈 JSON。 */
  browserInfo(): {
    userAgent: string;
    language: string;
    devicePixelRatio: number;
  };
  /** 当前时间（毫秒）；用于计算复制提示的展示窗口。 */
  now(): number;
}

export interface CaseEntry {
  readonly id: string;
  /** 非空观察重点；仅 included 用例进入列表（issue #62）。 */
  readonly observation: string;
}

export interface ViewOptions {
  readonly cases: readonly CaseEntry[];
  readonly host: ViewHost;
}

type DisplayMode = ControllerState["display"]["mode"];
type Background = ControllerState["display"]["background"];
type Scale = ControllerState["display"]["scale"];

const OVERLAY_OPACITY_DEFAULT = 0.5;
const NOTICE_DURATION_MS = 2500;

interface ViewRefs {
  readonly errorBox: HTMLElement;
  readonly errorSide: HTMLElement;
  readonly errorStage: HTMLElement;
  readonly errorReason: HTMLElement;
  readonly statusBox: HTMLElement;
  readonly nativeStage: HTMLElement;
  readonly compatStage: HTMLElement;
  readonly diffBox: HTMLElement;
  readonly diffEmpty: HTMLElement;
  readonly diffImageBox: HTMLElement;
  readonly diffStats: HTMLElement;
  readonly diffBounds: HTMLElement;
  readonly diffCanvas: HTMLCanvasElement;
  readonly stage: HTMLElement;
  readonly notice: HTMLElement;
}

/** 页面结构由视图层创建；CSS 常量见文件末尾。 */
class ComparisonView implements View {
  private readonly dispatch: (event: ViewEvent) => void;
  private readonly options: ViewOptions;
  private readonly refs: ViewRefs;
  private readonly select: HTMLSelectElement;
  private readonly prevButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly observationBox: HTMLElement;
  private readonly modeButtons: Record<DisplayMode, HTMLButtonElement>;
  private readonly backgroundButtons: Record<Background, HTMLButtonElement>;
  private readonly scaleButtons: Record<Scale, HTMLButtonElement>;
  private readonly opacitySlider: HTMLInputElement;
  private readonly opacityValue: HTMLElement;
  private readonly compatPane: HTMLElement;
  private readonly copyIdButton: HTMLButtonElement;
  private readonly copyFeedbackButton: HTMLButtonElement;
  private readonly rerunButton: HTMLButtonElement;
  private readonly diffToggleButton: HTMLButtonElement;

  private state: ControllerState | null = null;
  private currentIndex = -1;
  private renderedCaseId: string | null = null;
  private showDiffImage = true;
  private noticeUntil = 0;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    root: HTMLElement,
    dispatch: (event: ViewEvent) => void,
    options: ViewOptions,
  ) {
    this.dispatch = dispatch;
    this.options = options;
    root.classList.add("live-view-root");
    root.append(createStyleElement());

    const layout = document.createElement("div");
    layout.className = "live-view";
    root.append(layout);

    const toolbar = document.createElement("div");
    toolbar.className = "live-toolbar";
    layout.append(toolbar);

    // 用例导航：下拉 + 上一项/下一项，首尾停止不循环。
    const navGroup = toolbarGroup(toolbar, "live-nav");
    this.prevButton = button("◀ 上一项", () => this.step(-1));
    this.select = document.createElement("select");
    this.select.className = "live-case-select";
    this.select.setAttribute("aria-label", "选择用例");
    for (const entry of options.cases) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.id;
      this.select.append(option);
    }
    this.select.addEventListener("change", () => {
      const index = this.options.cases.findIndex(
        (entry) => entry.id === this.select.value,
      );
      this.currentIndex = index;
      this.dispatch({ type: "select-case", caseId: this.select.value });
    });
    this.nextButton = button("下一项 ▶", () => this.step(1));
    navGroup.append(this.prevButton, this.select, this.nextButton);

    // 执行与复制操作。
    const actionGroup = toolbarGroup(toolbar, "live-actions");
    this.rerunButton = button("重跑", () => this.dispatch({ type: "rerun" }));
    this.copyIdButton = button("复制 ID", () =>
      this.dispatch({ type: "copy-case-id" }),
    );
    this.copyFeedbackButton = button("复制反馈上下文", () =>
      this.dispatch({ type: "copy-feedback" }),
    );
    actionGroup.append(
      this.rerunButton,
      this.copyIdButton,
      this.copyFeedbackButton,
    );

    // 显示模式：分屏/重叠 + V 键。
    const modeGroup = toolbarGroup(toolbar, "live-modes");
    this.modeButtons = {
      split: button("分屏", () => this.setDisplay({ mode: "split" })),
      overlay: button("重叠", () => this.setDisplay({ mode: "overlay" })),
    };
    modeGroup.append(this.modeButtons.split, this.modeButtons.overlay);

    // 重叠透明度：默认 50%，可调 0–100%。
    const opacityGroup = toolbarGroup(toolbar, "live-opacity");
    const opacityLabel = document.createElement("label");
    opacityLabel.textContent = "上层透明度 ";
    this.opacitySlider = document.createElement("input");
    this.opacitySlider.type = "range";
    this.opacitySlider.min = "0";
    this.opacitySlider.max = "100";
    this.opacitySlider.step = "1";
    this.opacitySlider.value = String(OVERLAY_OPACITY_DEFAULT * 100);
    this.opacitySlider.addEventListener("input", () => {
      this.setDisplay({
        overlayOpacity: Number(this.opacitySlider.value) / 100,
      });
    });
    this.opacityValue = document.createElement("span");
    opacityLabel.append(this.opacitySlider, this.opacityValue);
    opacityGroup.append(opacityLabel);

    // 背景与显示比例。
    const backgroundGroup = toolbarGroup(toolbar, "live-backgrounds");
    this.backgroundButtons = {
      checker: button("棋盘格", () => this.setBackground("checker")),
      white: button("白底", () => this.setBackground("white")),
      black: button("黑底", () => this.setBackground("black")),
    };
    backgroundGroup.append(
      this.backgroundButtons.checker,
      this.backgroundButtons.white,
      this.backgroundButtons.black,
    );
    const scaleGroup = toolbarGroup(toolbar, "live-scales");
    this.scaleButtons = {
      fit: button("适应窗口", () => this.setScale("fit")),
      actual: button("1:1", () => this.setScale("actual")),
    };
    scaleGroup.append(this.scaleButtons.fit, this.scaleButtons.actual);

    // 差异图显示开关（issue #60：可切换的差异图）。
    this.diffToggleButton = button("差异图：开", () => {
      this.showDiffImage = !this.showDiffImage;
      if (this.state) this.renderDiff(this.state);
    });
    this.diffToggleButton.classList.add("live-diff-toggle");
    this.diffToggleButton.setAttribute("aria-pressed", "true");
    toolbar.append(this.diffToggleButton);

    this.observationBox = document.createElement("div");
    this.observationBox.className = "live-observation";
    layout.append(this.observationBox);

    const errorBox = document.createElement("div");
    errorBox.className = "live-error";
    const errorSide = document.createElement("span");
    errorSide.className = "live-error-side";
    const errorStage = document.createElement("span");
    errorStage.className = "live-error-stage";
    const errorReason = document.createElement("span");
    errorReason.className = "live-error-reason";
    errorBox.append(errorSide, errorStage, errorReason);
    layout.append(errorBox);

    const statusBox = document.createElement("div");
    statusBox.className = "live-status";
    const nativeStage = stageBadge("native");
    const compatStage = stageBadge("compat");
    statusBox.append(nativeStage, compatStage);
    layout.append(statusBox);

    // 显示舞台：分屏时两 pane 并排；重叠时同位置叠加。
    const stage = document.createElement("div");
    stage.className = "live-stage";
    const stageInner = document.createElement("div");
    stageInner.className = "live-stage-inner";
    const nativePane = pane("native", "原生");
    this.compatPane = pane("compat", "兼容");
    const overlayWrapper = document.createElement("div");
    overlayWrapper.className = "live-overlay";
    overlayWrapper.append(nativePane, this.compatPane);
    stageInner.append(overlayWrapper);
    stage.append(stageInner);
    layout.append(stage);

    const diffBox = document.createElement("div");
    diffBox.className = "live-diff";
    const diffEmpty = document.createElement("div");
    diffEmpty.className = "live-diff-empty";
    const diffStats = document.createElement("div");
    diffStats.className = "live-diff-stats";
    const diffBounds = document.createElement("div");
    diffBounds.className = "live-diff-bounds";
    const diffImageBox = document.createElement("div");
    diffImageBox.className = "live-diff-image-box";
    const diffCanvasWrap = document.createElement("div");
    diffCanvasWrap.className = "live-diff-canvas-wrap";
    const diffCanvas = document.createElement("canvas");
    diffCanvas.className = "live-diff-canvas";
    // 协调器在量测完成后写入真实逐像素数据。
    diffCanvas.setAttribute("aria-label", "逐像素二值差异图");
    diffCanvasWrap.append(diffCanvas);
    diffImageBox.append(diffCanvasWrap);
    diffBox.append(diffEmpty, diffStats, diffBounds, diffImageBox);
    layout.append(diffBox);

    const fingerprintNote = document.createElement("div");
    fingerprintNote.className = "live-fingerprint-note";
    fingerprintNote.textContent =
      "提示：部分浏览器的指纹保护会向画布读回加入噪声，差异可能包含隐私噪声；" +
      "本工具未检测保护状态（反馈中 fingerprintingProtection 为 not-tested）。";
    layout.append(fingerprintNote);

    const notice = document.createElement("div");
    notice.className = "live-notice";
    notice.setAttribute("role", "status");
    layout.append(notice);

    this.refs = {
      errorBox,
      errorSide,
      errorStage,
      errorReason,
      statusBox,
      nativeStage,
      compatStage,
      diffBox,
      diffEmpty,
      diffImageBox,
      diffStats,
      diffBounds,
      diffCanvas,
      stage,
      notice,
    };

    // 初始挂载两个插槽；controller 负责放入真实画布。
    options.host.attachCanvas(nativeSlot(nativePane), "native");
    options.host.attachCanvas(nativeSlot(this.compatPane), "compat");

    // 舞台尺寸变化（窗口缩放、画布重挂）时重算 fit 因子。
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.state?.display.scale === "fit") this.updateFitScale("fit");
      });
      this.resizeObserver.observe(stage);
      this.resizeObserver.observe(overlayWrapper);
    }
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = null;
  }

  render(state: ControllerState): void {
    this.state = state;
    this.renderNavigation(state);
    this.renderObservation(state);
    this.renderError(state);
    this.renderStages(state);
    this.renderDisplay(state);
    this.renderDiff(state);
    this.renderActions(state);
  }

  handleKey(key: string): void {
    // 控件聚焦期间页面级快捷键一律不触发（issue #60 键盘冲突）。
    if (this.isControlFocused()) return;
    if (key === "ArrowUp") {
      this.step(-1);
    } else if (key === "ArrowDown") {
      this.step(1);
    } else if (key === "v" || key === "V") {
      const current = this.state?.display.mode ?? "overlay";
      this.setDisplay({ mode: current === "split" ? "overlay" : "split" });
    }
  }

  shouldHandleKey(key: string): boolean {
    return (
      ["ArrowUp", "ArrowDown", "v", "V"].includes(key) &&
      !this.isControlFocused()
    );
  }

  /** 反馈复制成功/失败（剪贴板异常）时由 controller 回调展示提示。 */
  showNotice(message: string): void {
    this.refs.notice.textContent = message;
    this.refs.notice.classList.add("live-notice-visible");
    this.noticeUntil = this.options.host.now() + NOTICE_DURATION_MS;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      if (this.options.host.now() >= this.noticeUntil) {
        this.refs.notice.classList.remove("live-notice-visible");
      }
    }, NOTICE_DURATION_MS + 20);
  }

  async copyFeedback(report: FeedbackReport): Promise<boolean> {
    const state = this.state;
    // 防御：controller 误调用时拒绝，非终态不复制旧反馈（issue #64）。
    if (
      !state?.caseId ||
      (state.stage !== "completed" && state.stage !== "failed")
    ) {
      return false;
    }
    try {
      await this.options.host.copyText(JSON.stringify(report, null, 2));
      this.showNotice("反馈上下文已复制");
      return true;
    } catch (error) {
      this.showNotice(
        `复制失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  async copyCaseId(): Promise<boolean> {
    const caseId = this.state?.caseId;
    if (!caseId) return false;
    try {
      await this.options.host.copyText(caseId);
      this.showNotice("用例 ID 已复制");
      return true;
    } catch (error) {
      this.showNotice(
        `复制失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  private step(direction: -1 | 1): void {
    const total = this.options.cases.length;
    if (!total) return;
    const current = this.currentIndex;
    // 无有效选中（如 caseId 不在列表）时不做相对步进。
    if (current < 0) return;
    // 首尾停止：越界时不派发事件。
    if (direction < 0 && current <= 0) return;
    if (direction > 0 && current >= total - 1) return;
    const entry = this.options.cases[current + direction];
    if (!entry) return;
    this.dispatch({ type: "step-case", direction });
  }

  private setDisplay(partial: {
    mode?: DisplayMode;
    overlayOpacity?: number;
  }): void {
    if (partial.mode) {
      this.dispatch({ type: "set-display-mode", mode: partial.mode });
    }
    if (partial.overlayOpacity !== undefined) {
      const clamped = Math.min(1, Math.max(0, partial.overlayOpacity));
      this.dispatch({ type: "set-overlay-opacity", opacity: clamped });
    }
  }

  private setBackground(background: Background): void {
    this.dispatch({ type: "set-background", background });
  }

  private setScale(scale: Scale): void {
    this.dispatch({ type: "set-scale", scale });
  }

  private isControlFocused(): boolean {
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName;
    return (
      tag === "SELECT" ||
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      (active instanceof HTMLElement && active.isContentEditable)
    );
  }

  private renderNavigation(state: ControllerState): void {
    const total = this.options.cases.length;
    const index = this.options.cases.findIndex(
      (entry) => entry.id === state.caseId,
    );
    // caseId 不在列表（含 null）时重置索引，避免基于过期位置步进。
    this.currentIndex = index;
    if (index >= 0 && this.select.value !== state.caseId && state.caseId)
      this.select.value = state.caseId;
    this.prevButton.disabled = total === 0 || this.currentIndex <= 0;
    this.nextButton.disabled =
      total === 0 || this.currentIndex < 0 || this.currentIndex >= total - 1;
  }

  private renderObservation(state: ControllerState): void {
    const entry = this.options.cases.find((item) => item.id === state.caseId);
    const text = entry
      ? `观察重点：${entry.observation}`
      : state.caseId
        ? `用例 ${state.caseId} 不在展示列表中。`
        : "请选择用例。";
    if (this.renderedCaseId !== state.caseId) {
      this.observationBox.textContent = text;
      this.renderedCaseId = state.caseId;
    }
  }

  private renderError(state: ControllerState): void {
    const { errorBox, errorSide, errorStage, errorReason } = this.refs;
    if (state.error) {
      errorBox.classList.add("live-error-visible");
      errorSide.textContent = state.error.side
        ? sideLabel(state.error.side)
        : "两侧";
      errorStage.textContent = stageLabel(state.error.stage);
      errorReason.textContent = state.error.reason;
    } else {
      // 切换/重跑后 controller 清空 error，视图同步隐藏。
      errorBox.classList.remove("live-error-visible");
    }
  }

  private renderStages(state: ControllerState): void {
    updateStageBadge(this.refs.nativeStage, state.sides.native);
    updateStageBadge(this.refs.compatStage, state.sides.compat);
    this.refs.statusBox.hidden =
      state.stage === "idle" || state.stage === "disposed";
  }

  private renderDisplay(state: ControllerState): void {
    const { display } = state;
    this.refs.stage.dataset.mode = display.mode;
    this.refs.stage.dataset.background = display.background;
    this.refs.stage.dataset.scale = display.scale;
    this.updateFitScale(display.scale);
    // 仅调整 CSS 透明度；不改变画布 backing 尺寸，也不重跑。
    this.compatPane.style.opacity = String(
      display.mode === "overlay" ? display.overlayOpacity : 1,
    );
    const targetPercent = Math.round(display.overlayOpacity * 100);
    if (Number(this.opacitySlider.value) !== targetPercent) {
      this.opacitySlider.value = String(targetPercent);
    }
    this.opacityValue.textContent = ` ${Math.round(display.overlayOpacity * 100)}%`;
    markActive(this.modeButtons.split, display.mode === "split");
    markActive(this.modeButtons.overlay, display.mode === "overlay");
    markActive(
      this.backgroundButtons.checker,
      display.background === "checker",
    );
    markActive(this.backgroundButtons.white, display.background === "white");
    markActive(this.backgroundButtons.black, display.background === "black");
    markActive(this.scaleButtons.fit, display.scale === "fit");
    markActive(this.scaleButtons.actual, display.scale === "actual");
  }

  /**
   * fit 模式下计算统一缩放因子（issue #60：分屏/重叠均完整显示、
   * 保持相同显示比例）。内容固有尺寸按当前显示模式计算：分屏为两栏
   * 总宽（含间距），重叠为单栏最大宽；高度计入 pane 标签。
   * 因子作用于 overlay 整体，两侧共享同一比例，保持重叠对齐。
   * 1:1 模式清除全部内联尺寸，超出时舞台滚动。
   */
  private updateFitScale(scale: Scale): void {
    const overlay = this.refs.stage.querySelector(".live-overlay");
    if (!(overlay instanceof HTMLElement)) return;
    const inner = overlay.parentElement;
    if (scale !== "fit") {
      overlay.style.removeProperty("--live-fit-scale");
      overlay.style.removeProperty("width");
      overlay.style.removeProperty("height");
      if (inner instanceof HTMLElement) {
        inner.style.removeProperty("width");
        inner.style.removeProperty("height");
      }
      return;
    }
    const mode = this.state?.display.mode ?? "overlay";
    let maxWidth = 0;
    let maxHeight = 0;
    for (const canvas of overlay.querySelectorAll("canvas")) {
      if (!(canvas instanceof HTMLCanvasElement)) continue;
      maxWidth = Math.max(maxWidth, canvas.width);
      maxHeight = Math.max(maxHeight, canvas.height);
    }
    if (!maxWidth) return;
    // 分屏时标签占文档流高度；重叠时标签绝对定位不占位（画布对齐）。
    const label = overlay.querySelector(".live-pane-label");
    const labelHeight = label instanceof HTMLElement ? label.offsetHeight : 20;
    const split = mode === "split";
    const gap = split ? 16 : 0;
    const contentWidth = split ? maxWidth * 2 + gap : maxWidth;
    const contentHeight = maxHeight + (split ? labelHeight : 0);
    const availableWidth = this.refs.stage.clientWidth - 4;
    const availableHeight = this.refs.stage.clientHeight - 4;
    const factor = Math.min(
      1,
      availableWidth / contentWidth,
      availableHeight / contentHeight,
    );
    overlay.style.setProperty("--live-fit-scale", String(factor));
    // 保持布局尺寸与缩放后一致，避免滚动条按缩放前尺寸出现。
    overlay.style.width = `${contentWidth}px`;
    overlay.style.height = `${contentHeight}px`;
    if (inner instanceof HTMLElement) {
      inner.style.width = `${contentWidth * factor}px`;
      inner.style.height = `${contentHeight * factor}px`;
    }
  }

  private renderDiff(state: ControllerState): void {
    const {
      diffBox,
      diffEmpty,
      diffImageBox,
      diffStats,
      diffBounds,
      diffCanvas,
    } = this.refs;
    // 防御：仅 completed 状态接受 metrics；controller 异常传入
    // running+metrics 时视图不提前显示最终差异（issue #63）。
    const metrics = state.stage === "completed" ? state.difference : null;
    // 执行中/等待/失败均无有效指标；controller 已清空 difference。
    diffBox.classList.toggle("live-diff-active", metrics !== null);
    this.diffToggleButton.disabled = metrics === null;
    this.diffToggleButton.textContent = this.showDiffImage
      ? "差异图：开"
      : "差异图：关";
    this.diffToggleButton.setAttribute(
      "aria-pressed",
      String(this.showDiffImage),
    );
    diffImageBox.hidden = !this.showDiffImage || metrics === null;
    if (!metrics) {
      diffEmpty.textContent =
        state.stage === "failed"
          ? "本轮失败，无差异数据。"
          : state.stage === "completed"
            ? "量测不可用。"
            : "等待两侧完成后展示差异。";
      diffStats.textContent = "";
      diffBounds.textContent = "";
      diffCanvas.width = 0;
      diffCanvas.height = 0;
      return;
    }
    diffEmpty.textContent = "";
    diffStats.textContent = formatMetrics(metrics);
    diffBounds.textContent = metrics.differenceBounds
      ? `差异区域：x=${metrics.differenceBounds.x}, y=${metrics.differenceBounds.y}, ` +
        `宽 ${metrics.differenceBounds.width}, 高 ${metrics.differenceBounds.height}` +
        "（最小包围矩形，内部不保证全部不同）"
      : "差异区域：无";
    this.renderDiffCanvas(diffCanvas);
  }

  /** 真实逐像素图由协调器写入；无有效量测时保持零尺寸。 */
  private renderDiffCanvas(canvas: HTMLCanvasElement): void {
    if (!this.state?.difference) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  private renderActions(state: ControllerState): void {
    const hasCase = state.caseId !== null;
    this.rerunButton.disabled = !hasCase;
    this.copyIdButton.disabled = !hasCase;
    // 未到达终态（completed/failed）时禁用反馈复制，避免复制旧数据。
    this.copyFeedbackButton.disabled =
      !hasCase || (state.stage !== "completed" && state.stage !== "failed");
  }
}

function formatMetrics(metrics: DifferenceMetrics): string {
  // 非零比例不得因舍入显示为 0：小于 0.01% 时提升精度。
  const percent = metrics.changedRatio * 100;
  const ratioText =
    metrics.changedPixels === 0
      ? "0%"
      : percent < 0.01
        ? `${percent.toPrecision(2)}%（差异占比小于 0.01%）`
        : `${Number(percent.toFixed(2))}%`;
  return (
    `差异像素 ${metrics.changedPixels} / ${metrics.totalPixels}（${ratioText}）；` +
    `最大通道差 ${metrics.maxChannelDelta}（0–255）`
  );
}

function stageBadge(side: Side): HTMLElement {
  const badge = document.createElement("span");
  badge.className = "live-stage-badge";
  badge.dataset.side = side;
  return badge;
}

function updateStageBadge(
  badge: HTMLElement,
  stage: SessionStage | "idle",
): void {
  badge.dataset.stage = stage;
  badge.textContent = `${sideLabel(badge.dataset.side as Side)}：${stageLabel(stage)}`;
}

function sideLabel(side: Side): string {
  return side === "native" ? "原生" : "兼容";
}

function stageLabel(stage: SessionStage | "idle"): string {
  const labels: Record<SessionStage | "idle", string> = {
    idle: "待命",
    preparing: "准备中",
    ready: "就绪",
    running: "运行中",
    completed: "已完成",
    failed: "失败",
    disposing: "清理中",
    disposed: "已销毁",
  };
  return labels[stage];
}

function markActive(target: HTMLButtonElement, active: boolean): void {
  target.classList.toggle("live-active", active);
  target.setAttribute("aria-pressed", String(active));
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

function toolbarGroup(parent: HTMLElement, className: string): HTMLElement {
  const group = document.createElement("div");
  group.className = `live-toolbar-group ${className}`;
  parent.append(group);
  return group;
}

function pane(side: Side, label: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "live-pane";
  element.dataset.side = side;
  const caption = document.createElement("div");
  caption.className = "live-pane-label";
  caption.textContent = label;
  const slot = document.createElement("div");
  slot.className = "live-canvas-slot";
  slot.dataset.side = side;
  element.append(caption, slot);
  return element;
}

function nativeSlot(pane: HTMLElement): HTMLElement {
  const slot = pane.querySelector(".live-canvas-slot");
  if (!(slot instanceof HTMLElement))
    throw new Error("live-view: 缺少画布插槽");
  return slot;
}

function createStyleElement(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = VIEW_CSS;
  return style;
}

/** 浏览器默认宿主：剪贴板与浏览器信息来自 window/navigator。 */
export function createBrowserHost(
  attachCanvas: (slot: HTMLElement, side: Side) => void,
): ViewHost {
  return {
    attachCanvas,
    copyText: (text) => navigator.clipboard.writeText(text),
    browserInfo: () => ({
      userAgent: navigator.userAgent,
      language: navigator.language,
      devicePixelRatio: window.devicePixelRatio,
    }),
    now: () => Date.now(),
  };
}

export function createView(
  root: unknown,
  dispatch: (event: ViewEvent) => void,
  options: ViewOptions,
): ComparisonView {
  if (!(root instanceof HTMLElement))
    throw new Error("live-view: root 必须是 HTMLElement");
  if (!options?.host)
    throw new Error("live-view: 缺少宿主（attachCanvas/copyText）");
  return new ComparisonView(root, dispatch, options);
}

const VIEW_CSS = `
.live-view-root {
  font-family: system-ui, sans-serif;
  font-size: 14px;
  color: #1a1a1a;
}
.live-view { display: flex; flex-direction: column; gap: 8px; padding: 8px; }
.live-toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.live-toolbar-group { display: flex; gap: 4px; align-items: center; }
.live-toolbar-group button.live-active { background: #1a1a1a; color: #fff; }
.live-case-select { min-width: 280px; }
.live-observation { color: #444; }
.live-error {
  display: none;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid #c62828;
  background: #fdecea;
  color: #8c1c1c;
}
.live-error-visible { display: flex; }
.live-error-side { font-weight: 600; }
.live-error-stage { color: #8c1c1c; opacity: 0.8; }
.live-status { display: flex; gap: 12px; }
.live-stage-badge { padding: 2px 8px; border: 1px solid #999; border-radius: 10px; }
.live-stage-badge[data-stage="completed"] { border-color: #2e7d32; color: #2e7d32; }
.live-stage-badge[data-stage="failed"] { border-color: #c62828; color: #c62828; }
.live-stage { overflow: auto; border: 1px solid #ccc; min-height: 240px; }
.live-stage[data-background="white"] { background: #fff; }
.live-stage[data-background="black"] { background: #000; }
.live-stage[data-background="checker"] {
  background-image:
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
}
.live-stage-inner { display: inline-block; }
.live-stage[data-mode="split"] .live-overlay { display: flex; gap: 16px; }
.live-stage[data-mode="split"] .live-pane { position: static; }
.live-stage[data-mode="overlay"] .live-overlay {
  position: relative;
  display: inline-block;
}
.live-stage[data-mode="overlay"] .live-pane[data-side="native"] {
  position: relative;
}
.live-stage[data-mode="overlay"] .live-pane[data-side="compat"] {
  position: absolute;
  inset: 0;
}
/* 重叠时两侧标签都浮在画布之上、脱离文档流：
   两画布从各自 pane 顶部开始，保持同位置对齐（issue #63）。 */
.live-stage[data-mode="overlay"] .live-pane .live-pane-label {
  position: absolute;
  top: 0;
  background: rgba(255, 255, 255, 0.7);
  z-index: 1;
}
.live-stage[data-mode="overlay"] .live-pane[data-side="native"] .live-pane-label {
  left: 0;
}
.live-stage[data-mode="overlay"] .live-pane[data-side="compat"] .live-pane-label {
  right: 0;
}
.live-pane-label { font-size: 12px; padding: 2px 6px; color: #333; }
/* fit 缩放因子由 JS 计算后写入 --live-fit-scale 并作用于 overlay 整体：
   重叠时两侧共享同一缩放比例对齐（issue #63）；缩放只改显示，不改 backing。 */
.live-stage[data-scale="fit"] .live-overlay {
  transform: scale(var(--live-fit-scale, 1));
  transform-origin: top left;
}

.live-diff { display: none; flex-direction: column; gap: 4px; }
.live-diff-active { display: flex; }
.live-diff-empty { color: #666; }
.live-diff-canvas-wrap { margin-top: 4px; position: relative; }
.live-diff-canvas {
  border: 1px dashed #999;
  background:
    repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 0 0 / 16px 16px;
}
.live-fingerprint-note { font-size: 12px; color: #666; }
.live-notice {
  min-height: 20px;
  color: #2e7d32;
  opacity: 0;
  transition: opacity 0.15s;
}
.live-notice-visible { opacity: 1; }
`;
