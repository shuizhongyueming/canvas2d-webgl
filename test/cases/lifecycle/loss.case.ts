import type { CaseDefinition } from "../../types/testing.js";
import type { TestHooks } from "../../types/testing.js";
import {
  capture,
  displayPixel,
  drawHarnessMarker,
  makeCompat,
  pixelAt,
  present,
  settle,
  task,
  waitFor,
  type CompatHandle,
} from "./helpers.js";

const base = {
  kind: "semantic" as const,
  width: 8,
  height: 6,
  seed: 1,
  fonts: [] as string[],
};

interface SceneState {
  readonly width: number;
  readonly height: number;
  readonly generation: number;
  readonly cleared: boolean;
}

function sceneState(hooks: TestHooks): SceneState {
  const scene = hooks.readScene();
  return {
    width: scene.width,
    height: scene.height,
    generation: scene.generation,
    cleared: scene.pixels.every((byte) => byte === 0),
  };
}

function lostEvent(): Event {
  return new Event("webglcontextlost", { cancelable: true });
}

function restoredEvent(): Event {
  return new Event("webglcontextrestored");
}

interface LossRecord {
  lost: number;
  restored: number;
  order: string[];
  drawWhileLost: string;
  sceneAtRestore: SceneState | null;
  drawAtRestore: string;
  generationAtRestore: number | null;
}

function makeRecord(): LossRecord {
  return {
    lost: 0,
    restored: 0,
    order: [],
    drawWhileLost: "not-run",
    sceneAtRestore: null,
    drawAtRestore: "not-run",
    generationAtRestore: null,
  };
}

export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "LIFE-02.loss-before-present",
    kind: "combined",
    requirements: ["LIFE-02", "CAN-05"],
    display: {
      status: "excluded",
      reason:
        "主 target 仅统一 marker；实际断言针对辅助 compat 画布，reference 也运行兼容库（决策 #62 明确排除）",
    },
    async run(a) {
      drawHarnessMarker(a);
      const record = makeRecord();
      const handle = await makeCompat(8, 6, {
        onContextLost: () => {
          record.lost += 1;
          record.order.push("lost");
        },
        onContextRestored: () => {
          record.restored += 1;
          record.order.push("restored");
        },
      });
      const { context, canvas, hooks, target } = handle;
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 8, 6);
      const generation = hooks.readScene().generation;
      const waiting = settle(hooks.whenPresented(generation));

      // The orchestration boundary handles the loss synchronously, so the
      // pending microtask present can only be cancelled deterministically.
      target.dispatchEvent(lostEvent());
      a.assert(record.lost === 1, "the loss callback ran once");
      a.assert(
        (await waiting).outcome === "present-invalidated",
        "a loss before the checkpoint cancels the queued present",
      );

      const drawDuring = capture(() => context.fillRect(0, 0, 2, 2));
      const resizeDuring = capture(() => {
        canvas.width = 4;
      });
      a.assert(drawDuring === "ok", "drawing while lost does not throw");
      a.assert(resizeDuring === "ok", "resize while lost does not throw");
      a.assert(canvas.width === 8, "resize while lost is not queued");
      a.assert(
        capture(() => hooks.readScene()) === "capability-unavailable",
        "the lost scene is not readable",
      );

      await task();
      a.assert(record.lost === 1, "the loss is not re-entered");
      a.observe("order", record.order);
      a.observe("drawDuring", drawDuring);
      a.observe("resizeDuring", resizeDuring);
      a.observe("widthDuring", 8);
      a.observe("paused", "capability-unavailable");

      target.dispatchEvent(restoredEvent());
      a.assert(record.restored === 1, "the restored callback ran once");
      await present(hooks);
      const restored = sceneState(hooks);
      a.assert(restored.cleared, "the restored scene is transparent");
      a.observe("restoredCleared", restored.cleared);
      canvas.dispose();
    },
  },
  {
    ...base,
    id: "LIFE-03.restore-empty-generation",
    kind: "combined",
    requirements: ["LIFE-03"],
    display: {
      status: "excluded",
      reason:
        "主 target 仅统一 marker；实际断言针对辅助 compat 画布，reference 也运行兼容库（决策 #62 明确排除）",
    },
    async run(a) {
      drawHarnessMarker(a);
      const handle = await makeCompat(8, 6);
      const { context, canvas, hooks, target, gl } = handle;
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 8, 6);
      await present(hooks);
      const before = sceneState(hooks);

      target.dispatchEvent(lostEvent());
      target.dispatchEvent(restoredEvent());
      const after = sceneState(hooks);
      a.assert(
        after.generation > before.generation,
        "restoration advances the generation",
      );
      a.assert(
        after.width === before.width && after.height === before.height,
        "restoration keeps the accepted size",
      );
      a.assert(after.cleared, "restoration starts from an empty scene");

      await present(hooks);
      a.assert(
        displayPixel(gl, after.width, after.height, 0, 0)[3] === 0,
        "the display is cleared to transparent black",
      );

      context.fillStyle = "#0000ff";
      context.fillRect(0, 0, 3, 3);
      await present(hooks);
      const redrawn = hooks.readScene();
      a.assert(
        pixelAt(redrawn, 0, 0)[2] === 255,
        "the canvas is drawable on the restored generation",
      );
      a.observe("generationBefore", before.generation);
      a.observe("generationAfter", after.generation);
      a.observe("cleared", after.cleared);
      a.observe("redrawn", pixelAt(redrawn, 0, 0));
      canvas.dispose();
    },
  },
  {
    ...base,
    id: "lifecycle.loss.callback-order",
    requirements: ["LIFE-02", "LIFE-03", "ACC-05"],
    async run(a) {
      const record = makeRecord();
      let handle!: CompatHandle;
      handle = await makeCompat(8, 6, {
        onContextLost: () => {
          record.lost += 1;
          record.order.push("lost");
          record.drawWhileLost = capture(() =>
            handle.context.fillRect(0, 0, 1, 1),
          );
        },
        onContextRestored: () => {
          record.restored += 1;
          record.order.push("restored");
          const scene = sceneState(handle.hooks);
          record.sceneAtRestore = scene;
          record.generationAtRestore = scene.generation;
          record.drawAtRestore = capture(() => {
            handle.context.fillStyle = "#00ff00";
            handle.context.fillRect(0, 0, 2, 2);
          });
        },
      });
      const { context, canvas, hooks, target } = handle;
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 8, 6);
      await present(hooks);

      target.dispatchEvent(lostEvent());
      target.dispatchEvent(restoredEvent());

      a.assert(
        record.order.join(",") === "lost,restored",
        "callbacks run once each in loss then restoration order",
      );
      a.assert(
        record.drawWhileLost === "ok",
        "drawing inside the lost callback stays silent",
      );
      a.assert(
        record.sceneAtRestore?.cleared === true,
        "the restored callback observes an empty scene",
      );
      a.assert(record.drawAtRestore === "ok", "the restored callback can draw");
      await present(hooks);
      const scene = hooks.readScene();
      a.assert(
        pixelAt(scene, 0, 0)[1] === 255 && pixelAt(scene, 0, 0)[3] === 255,
        "the redraw from the restored callback reached the scene",
      );
      a.observe("order", record.order);
      a.observe("drawWhileLost", record.drawWhileLost);
      a.observe("sceneAtRestore", record.sceneAtRestore);
      a.observe("drawAtRestore", record.drawAtRestore);
      a.observe("callbackPixel", pixelAt(scene, 0, 0));
      canvas.dispose();
    },
  },
  {
    ...base,
    id: "lifecycle.loss.webgl-lose-context",
    requirements: ["LIFE-02", "LIFE-03", "ACC-05"],
    async run(a) {
      const record = makeRecord();
      let handle!: CompatHandle;
      handle = await makeCompat(8, 6, {
        onContextLost: () => {
          record.lost += 1;
          record.order.push("lost");
          record.drawWhileLost = capture(() =>
            handle.context.fillRect(0, 0, 1, 1),
          );
        },
        onContextRestored: () => {
          record.restored += 1;
          record.order.push("restored");
          const scene = sceneState(handle.hooks);
          record.sceneAtRestore = scene;
          record.generationAtRestore = scene.generation;
          record.drawAtRestore = capture(() => {
            handle.context.fillStyle = "#00ff00";
            handle.context.fillRect(0, 0, 2, 2);
          });
        },
      });
      const { context, canvas, hooks, target, gl } = handle;
      const extension = gl.getExtension("WEBGL_lose_context");
      if (!extension) return a.skip("WEBGL_lose_context-unavailable");

      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 8, 6);
      await present(hooks);
      const before = sceneState(hooks);

      extension.loseContext();
      await waitFor(
        () => record.lost === 1,
        "the real context-loss event",
        10000,
      );
      a.assert(gl.isContextLost(), "the platform really lost the context");
      a.assert(
        capture(() => hooks.readScene()) === "capability-unavailable",
        "the scene is unreadable during a real loss",
      );
      const drawDuring = capture(() => context.fillRect(0, 0, 2, 2));
      const resizeDuring = capture(() => {
        canvas.width = 4;
      });
      a.assert(drawDuring === "ok", "drawing during a real loss is silent");
      a.assert(resizeDuring === "ok", "resize during a real loss is silent");
      a.assert(canvas.width === 8, "the lost resize was not queued");

      extension.restoreContext();
      await waitFor(
        () => record.restored === 1,
        "the real context-restored event",
        10000,
      );
      a.assert(!gl.isContextLost(), "the platform restored the context");
      const after = sceneState(hooks);
      a.assert(after.generation > before.generation, "generation advanced");
      a.assert(
        after.width === before.width && after.height === before.height,
        "restoration keeps the accepted size",
      );
      // The restored callback already redrew, so emptiness is asserted at the
      // callback boundary where the guarantee applies.
      a.assert(
        record.sceneAtRestore?.cleared === true,
        "the callback saw the cleared scene before notification",
      );
      await present(hooks);
      const display = displayPixel(gl, after.width, after.height, 0, 0);
      a.assert(
        display[1] === 255 && display[3] === 255,
        "the redraw from the restored callback is on display",
      );
      a.assert(
        displayPixel(gl, after.width, after.height, 7, 5)[3] === 0,
        "the rest of the display is transparent black",
      );
      const afterRedraw = pixelAt(hooks.readScene(), 0, 0);

      canvas.dispose();
      a.assert(!gl.isContextLost(), "dispose after restore keeps the context");
      a.observe("order", record.order);
      a.observe("drawDuring", drawDuring);
      a.observe("resizeDuring", resizeDuring);
      a.observe("generationBefore", before.generation);
      a.observe("generationAfter", after.generation);
      a.observe("sceneAtRestore", record.sceneAtRestore);
      a.observe("afterRedraw", afterRedraw);
      a.observe("display", display);
      a.observe("contextAlive", !gl.isContextLost());
      void target;
    },
  },
];
