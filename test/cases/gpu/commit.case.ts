import type { CaseDefinition } from "../../types/testing.js";
import {
  BLUE,
  GREEN,
  RED,
  countPixels,
  isTransparent,
  makeRenderer,
  nextFrame,
  pixelAt,
  readDisplayPixel,
  rectDraw,
  settle,
  task,
} from "./device-driver.js";

export const cases: CaseDefinition[] = [
  {
    id: "gpu.commit.sync-burst",
    requirements: ["CAN-05"],
    kind: "semantic",
    width: 32,
    height: 32,
    seed: 1,
    fonts: [],
    async run(a) {
      const { device, hooks } = await makeRenderer(4, 4);
      a.observe("presentsBefore", hooks.resourceCounts().presents);
      device.draw(
        rectDraw(device.generation, { x: 0, y: 0, width: 4, height: 4 }, RED),
      );
      device.draw(
        rectDraw(device.generation, { x: 0, y: 0, width: 4, height: 2 }, GREEN),
      );
      device.draw(
        rectDraw(device.generation, { x: 0, y: 0, width: 1, height: 1 }, BLUE),
      );
      a.observe("presentsSync", hooks.resourceCounts().presents);
      await hooks.whenPresented(device.generation);
      a.observe("presentsAfter", hooks.resourceCounts().presents);
      const scene = hooks.readScene();
      a.observe("topLeft", pixelAt(scene, 0, 0));
      a.observe("middle", pixelAt(scene, 3, 1));
      a.observe("bottom", pixelAt(scene, 3, 3));
      device.dispose();
    },
  },
  {
    id: "gpu.commit.promise-raf",
    requirements: ["CAN-05"],
    kind: "semantic",
    width: 32,
    height: 32,
    seed: 1,
    fonts: [],
    async run(a) {
      const { gl, device, hooks } = await makeRenderer(4, 4);
      const generation = device.generation;
      device.draw(
        rectDraw(generation, { x: 0, y: 0, width: 2, height: 4 }, RED),
      );
      const appended = Promise.resolve().then(() => {
        device.draw(rectDraw(generation, { x: 2, y: 0, width: 2, height: 4 }, BLUE));
      });
      await hooks.whenPresented(generation);
      // The promise-appended draw missed this task's checkpoint: the first
      // present already carried a red-only scene to the display.
      a.observe("displayLeftMid", readDisplayPixel(gl, 0, 0));
      a.observe("displayRightMid", readDisplayPixel(gl, 3, 0));
      a.observe("presentsMid", hooks.resourceCounts().presents);
      await appended;
      await hooks.whenPresented(generation);
      a.observe("displayRightEnd", readDisplayPixel(gl, 3, 0));
      a.observe("presentsEnd", hooks.resourceCounts().presents);
      await nextFrame();
      device.draw(
        rectDraw(generation, { x: 1, y: 1, width: 2, height: 2 }, GREEN),
      );
      await hooks.whenPresented(generation);
      a.observe("displayCenter", readDisplayPixel(gl, 1, 1));
      a.observe("presentsFinal", hooks.resourceCounts().presents);
      a.observe("sceneFinal", pixelAt(hooks.readScene(), 0, 0));
      device.dispose();
    },
  },
  {
    id: "gpu.commit.stale-generation",
    requirements: ["CAN-05"],
    kind: "semantic",
    width: 32,
    height: 32,
    seed: 1,
    fonts: [],
    async run(a) {
      const { gl, device, hooks } = await makeRenderer(4, 4);
      const generation = device.generation;
      device.draw(
        rectDraw(generation, { x: 0, y: 0, width: 4, height: 4 }, RED),
      );
      const waiting = settle(hooks.whenPresented(generation));
      device.resize(2, 2);
      a.observe("waiterRejected", (await waiting).outcome);
      a.observe("status", device.status);
      a.observe("size", [device.width, device.height]);
      a.observe("clearedScene", countPixels(hooks.readScene(), isTransparent));
      await hooks.whenPresented(device.generation);
      a.observe("presents", hooks.resourceCounts().presents);
      a.observe("display", readDisplayPixel(gl, 0, 0));
      device.dispose();
    },
  },
  {
    id: "gpu.commit.loss-before-present",
    requirements: ["LIFE-02", "LIFE-03"],
    kind: "semantic",
    width: 32,
    height: 32,
    seed: 1,
    fonts: [],
    async run(a) {
      const { device, hooks } = await makeRenderer(2, 2);
      const generation = device.generation;
      device.draw(
        rectDraw(generation, { x: 0, y: 0, width: 2, height: 2 }, RED),
      );
      const waiting = settle(hooks.whenPresented(generation));
      device.lose();
      a.observe("waiterRejected", (await waiting).outcome);
      await task();
      a.observe("presentsDuringLoss", hooks.resourceCounts().presents);
      device.restore();
      await hooks.whenPresented(device.generation);
      a.observe("presentsAfterRestore", hooks.resourceCounts().presents);
      a.observe("clearedScene", countPixels(hooks.readScene(), isTransparent));
      device.dispose();
    },
  },
];
