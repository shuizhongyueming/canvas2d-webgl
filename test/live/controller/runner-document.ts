import type { RunnerBootstrap, RunnerEnvironment } from "../runner/executor.js";
import { installRunnerWindow } from "../runner/executor.js";

/** 每份 runner 文档仅消费一次 URL 参数，不支持文档内重跑。 */
export function startRunnerDocument(win: Window): void {
  const query = new URLSearchParams(win.location.search);
  const side = query.get("side");
  const sessionId = query.get("sessionId");
  const caseId = query.get("caseId");
  if ((side !== "native" && side !== "compat") || !sessionId || !caseId)
    throw new Error("runner-document: invalid bootstrap");
  const positiveTimeout = (name: string): number => {
    const value = Number(query.get(name));
    if (!Number.isFinite(value) || value <= 0)
      throw new Error(`runner-document: invalid ${name}`);
    return value;
  };
  const environment: RunnerEnvironment = {
    postMessage(message) {
      win.parent.postMessage(message, win.location.origin);
    },
  };
  const bootstrap: RunnerBootstrap = {
    sessionId,
    side,
    caseId,
    caseModuleUrl: required(query, "caseModuleUrl"),
    libraryUrl: required(query, "libraryUrl"),
    hooksUrl: required(query, "hooksUrl"),
    timeouts: {
      prepare: positiveTimeout("prepareTimeout"),
      run: positiveTimeout("runTimeout"),
    },
    post: (message) => environment.postMessage(message),
  };
  const session = installRunnerWindow(win, bootstrap);
  win.addEventListener("keydown", (event) => {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !["ArrowUp", "ArrowDown", "v", "V"].includes(event.key)
    )
      return;
    event.preventDefault();
    win.parent.postMessage(
      { type: "live-shortcut", key: event.key, sessionId },
      win.location.origin,
    );
  });
  // 显式清理子文档监听；移除 iframe 仍作为不可响应环境的兜底。
  win.addEventListener("pagehide", () => void session.dispose());
}

function required(query: URLSearchParams, key: string): string {
  const value = query.get(key);
  if (!value) throw new Error(`runner-document: missing ${key}`);
  return value;
}
