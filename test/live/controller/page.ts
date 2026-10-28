import type { LiveDisplayEntry } from "../catalog/display-catalog.js";
import type { RunnerMessage } from "../contracts/index.js";
import { createBrowserHost, createView, type View } from "../view/view.js";
import { type Coordinator, createCoordinator } from "./coordinator.js";
import { createRunnerFrame } from "./frames.js";

interface CatalogEntry extends LiveDisplayEntry {
  readonly caseModuleUrl: string;
}

function timeout(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 120000)
    return fallback;
  return parsed;
}

/** #71 仅提供协调器与真实 iframe 页面；完整端到端产品接线由 #72 收尾。 */
export async function startLivePage(root: HTMLElement): Promise<{
  coordinator: Coordinator;
  view: View;
  dispose(): Promise<void>;
}> {
  const response = await fetch("/api/catalog", { cache: "no-store" });
  if (!response.ok) throw new Error(`catalog-http-${response.status}`);
  const cases = (await response.json()) as CatalogEntry[];
  if (!Array.isArray(cases) || !cases.length) throw new Error("catalog-empty");
  const query = new URLSearchParams(location.search);
  const timeouts = {
    prepare: timeout(query.get("prepare"), 10000),
    run: timeout(query.get("run"), 10000),
  };
  let coordinator: Coordinator;
  const slots = new Map<"native" | "compat", HTMLElement>();
  const view = createView(
    root,
    (event) => {
      coordinator.dispatch(event);
      if (event.type === "copy-case-id") void view.copyCaseId();
      if (event.type === "copy-feedback") {
        const report = coordinator.feedback();
        if (report) void view.copyFeedback(report);
      }
    },
    {
      cases: cases.map((entry) => ({
        id: entry.id,
        observation: entry.display.observation,
      })),
      host: createBrowserHost((slot, side) => {
        slots.set(side, slot);
      }),
    },
  );
  coordinator = createCoordinator({
    cases,
    timeouts,
    createFrame(sessionId, side, caseId) {
      const entry = cases.find((item) => item.id === caseId);
      if (!entry) throw new Error(`case-not-found: ${caseId}`);
      return createRunnerFrame(
        sessionId,
        side,
        caseId,
        {
          caseModuleUrl: entry.caseModuleUrl,
          libraryUrl: "/dist/index.js",
          hooksUrl: "/dist/gpu/hooks.js",
        },
        timeouts,
      );
    },
    browserInfo: () => ({
      userAgent: navigator.userAgent,
      language: navigator.language,
      devicePixelRatio: devicePixelRatio,
    }),
    onChange: (state) => view.render(state),
  });
  coordinator.attachCanvas(slots.get("native") as HTMLElement, "native");
  coordinator.attachCanvas(slots.get("compat") as HTMLElement, "compat");
  const differenceCanvas = root.querySelector(".live-diff-canvas");
  if (!(differenceCanvas instanceof HTMLCanvasElement))
    throw new Error("live-page: missing difference canvas");
  coordinator.attachDifferenceCanvas(differenceCanvas);
  const onMessage = (event: MessageEvent): void => {
    if (event.origin !== location.origin) return;
    const shortcut = event.data as {
      type?: string;
      key?: string;
      sessionId?: string;
    } | null;
    if (shortcut?.type === "live-shortcut") {
      if (shortcut.sessionId !== coordinator.state.sessionId) return;
      const sourceFrame = [...document.querySelectorAll("iframe")].find(
        (frame) =>
          frame.dataset.sessionId === shortcut.sessionId &&
          frame.contentWindow === event.source,
      );
      if (!sourceFrame || typeof shortcut.key !== "string") return;
      onKey(shortcut.key);
      return;
    }
    coordinator.receive(event.data as RunnerMessage, event.source);
  };
  const onKey = (event: KeyboardEvent | string): void => {
    const key = typeof event === "string" ? event : event.key;
    if (
      typeof event !== "string" &&
      (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey)
    )
      return;
    if (view.shouldHandleKey(key)) {
      if (typeof event !== "string") event.preventDefault();
      view.handleKey(key);
    }
  };
  window.addEventListener("message", onMessage);
  document.addEventListener("keydown", onKey);
  view.render(coordinator.state);
  coordinator.dispatch({ type: "select-case", caseId: cases[0]?.id ?? "" });
  return {
    coordinator,
    view,
    async dispose() {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("keydown", onKey);
      view.dispose();
      await coordinator.dispose();
      root.replaceChildren();
    },
  };
}

const root = document.getElementById("app");
if (root) {
  const live = startLivePage(root);
  if (new URLSearchParams(location.search).has("testController"))
    Object.defineProperty(window, "__liveTestPage", { value: live });
}
