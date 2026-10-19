import type { CaseAdapter } from "../../types/testing.js";

/** Stable error observation: the compat code when present, else the error name. */
export function outcome(fn: () => void): string {
  try {
    fn();
    return "ok";
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string"
      ? code
      : ((error as Error).constructor.name ?? "unknown");
  }
}

/** Only the compat canvas carries the library-level dispose entry point. */
export function isCompat(adapter: CaseAdapter): boolean {
  return "dispose" in adapter.canvas;
}
