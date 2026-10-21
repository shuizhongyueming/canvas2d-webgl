import type { CaseDefinition } from "../../types/testing.js";
import { outcome } from "../shared.js";
import {
  capture,
  displayPixel,
  drawHarnessMarker,
  makeCompat,
  present,
  settle,
  task,
} from "./helpers.js";

const base = {
  kind: "semantic" as const,
  width: 8,
  height: 6,
  seed: 1,
  fonts: [] as string[],
};

export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "LIFE-01.dispose-pending-present",
    kind: "combined",
    requirements: ["LIFE-01", "CAN-05"],
    async run(a) {
      // The harness canvas keeps the captured render pair meaningful.
      drawHarnessMarker(a);
      const handle = await makeCompat(8, 6);
      const { context, canvas, hooks, target, gl } = handle;
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 8, 6);
      await present(hooks);
      const generation = hooks.readScene().generation;
      const displayed = displayPixel(gl, 8, 6, 0, 0);
      a.assert(
        displayed[0] === 255 && displayed[3] === 255,
        "red is on display",
      );

      // Queue another draw, then dispose before the microtask checkpoint.
      context.fillStyle = "#0000ff";
      context.fillRect(0, 0, 8, 6);
      const waiting = settle(hooks.whenPresented(generation));
      canvas.dispose();
      canvas.dispose();

      a.assert(
        (await waiting).outcome === "present-invalidated",
        "dispose cancels the queued present",
      );
      // Disposal does not clear, paint or otherwise touch the target frame.
      const afterDispose = displayPixel(gl, 8, 6, 0, 0);
      a.assert(
        afterDispose[0] === 255 && afterDispose[3] === 255,
        "the last presented frame stays on the target",
      );
      await task();
      a.assert(!gl.isContextLost(), "dispose never loses the target context");
      a.assert(
        capture(() => hooks.readScene()) === "disposed",
        "the scene hook reports the disposed canvas",
      );
      a.observe("queued", "present-invalidated");
      a.observe("displayed", afterDispose);
      a.observe("contextAlive", !gl.isContextLost());
      a.observe("targetSize", [target.width, target.height]);
      a.observe(
        "hookAfterDispose",
        capture(() => hooks.readScene()),
      );
    },
  },
  {
    ...base,
    id: "lifecycle.dispose.twice",
    requirements: ["LIFE-01"],
    async run(a) {
      const { canvas, target, gl, context } = await makeCompat(8, 6);
      canvas.dispose();
      canvas.dispose();
      a.assert(canvas.dispose() === undefined, "dispose stays idempotent");
      a.assert(
        outcome(() => canvas.getContext("2d")) === "disposed",
        "getContext is intercepted after dispose",
      );
      a.assert(
        outcome(() => String(canvas.width)) === "disposed",
        "width reads are intercepted after dispose",
      );
      a.assert(
        outcome(() => String(canvas.height)) === "disposed",
        "height reads are intercepted after dispose",
      );
      a.assert(
        outcome(() => {
          canvas.width = 4;
        }) === "disposed",
        "width writes are intercepted after dispose",
      );
      a.assert(
        outcome(() => context.fillRect(0, 0, 1, 1)) === "disposed",
        "drawing reports disposed instead of silently continuing",
      );
      // Passthrough members are still the platform's own DOM behavior.
      canvas.style.setProperty("--c2w-dispose", "1");
      a.assert(
        canvas.style.getPropertyValue("--c2w-dispose") === "1",
        "style still forwards after dispose",
      );
      a.assert(
        canvas.getBoundingClientRect().width >= 0,
        "layout still forwards after dispose",
      );
      a.assert(
        target.width === 8 && target.height === 6,
        "the caller's target is not destroyed or resized",
      );
      a.assert(!gl.isContextLost(), "dispose does not lose the context");
      a.observe("disposedCode", "disposed");
      a.observe(
        "styleForwarded",
        canvas.style.getPropertyValue("--c2w-dispose"),
      );
      a.observe("contextAlive", !gl.isContextLost());
      a.observe("targetSize", [target.width, target.height]);
    },
  },
  {
    ...base,
    id: "lifecycle.dispose.removes-listeners",
    requirements: ["LIFE-01", "LIFE-02"],
    async run(a) {
      let lost = 0;
      let restored = 0;
      const handle = await makeCompat(8, 6, {
        onContextLost: () => {
          lost += 1;
        },
        onContextRestored: () => {
          restored += 1;
        },
      });
      const { canvas, target, gl } = handle;
      canvas.dispose();

      // A platform event after disposal must not re-enter the library.
      target.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
      target.dispatchEvent(new Event("webglcontextrestored"));
      await task();
      a.assert(lost === 0, "the lost listener was removed");
      a.assert(restored === 0, "the restored listener was removed");
      a.assert(
        !gl.isContextLost(),
        "a late lost event did not lose the context",
      );
      a.observe("lostCallbacks", lost);
      a.observe("restoredCallbacks", restored);
      a.observe("contextAlive", !gl.isContextLost());
    },
  },
];
