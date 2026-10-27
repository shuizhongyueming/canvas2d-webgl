import type { Side } from "../contracts/index.js";
import type { RunnerFrame } from "./coordinator.js";

export interface FrameUrls {
  readonly caseModuleUrl: string;
  readonly libraryUrl: string;
  readonly hooksUrl: string;
}

/** 使用服务端生成的 runner 文档。load 之后才发送 prepare，避免早期消息丢失。 */
export function createRunnerFrame(
  sessionId: string,
  side: Side,
  caseId: string,
  urls: FrameUrls,
  timeouts: { readonly prepare: number; readonly run: number },
): RunnerFrame {
  const element = document.createElement("iframe");
  element.dataset.sessionId = sessionId;
  element.dataset.side = side;
  let loaded = false;
  let pending: import("../contracts/index.js").ControllerMessage | null = null;
  let disposed = false;
  const post = (
    message: import("../contracts/index.js").ControllerMessage,
  ): void => {
    if (message.type === "dispose") disposed = true;
    if (message.type === "prepare" && !loaded) {
      pending = message;
      return;
    }
    const target = element.contentWindow;
    if (!target) throw new Error("runner-frame-unavailable");
    target.postMessage(message, window.location.origin);
  };
  const query = new URLSearchParams({
    sessionId,
    side,
    caseId,
    caseModuleUrl: urls.caseModuleUrl,
    libraryUrl: urls.libraryUrl,
    hooksUrl: urls.hooksUrl,
    prepareTimeout: String(timeouts.prepare),
    runTimeout: String(timeouts.run),
  });
  element.addEventListener("load", () => {
    if (disposed) return;
    loaded = true;
    if (pending) {
      const message = pending;
      pending = null;
      post(message);
    }
  });
  element.src = `/runner.html?${query}`;
  return { element, post };
}
