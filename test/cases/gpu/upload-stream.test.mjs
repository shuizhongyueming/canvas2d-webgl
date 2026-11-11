import test from "node:test";
import assert from "node:assert/strict";
import { TextureStream } from "../../../dist/gpu/stream.js";
import { createPresenter } from "../../../dist/scheduling/presenter.js";
import { RasterBatch } from "../../../dist/gpu/raster-batch.js";
import {
  drawState,
  IDENTITY,
} from "../../../.build/test/cases/gpu/device-driver.js";

test("readback cannot consume an upload error before the scheduled commit", async () => {
  let pending = 0;
  const noop = () => {};
  const gl = {
    NO_ERROR: 0,
    getError() {
      const error = pending;
      pending = 0;
      return error;
    },
    isContextLost: () => false,
    createTexture: () => ({}),
    activeTexture: noop,
    bindTexture: noop,
    texParameteri: noop,
    pixelStorei: noop,
    texImage2D: noop,
    texSubImage2D() {
      pending = 1285;
    },
    deleteTexture: noop,
  };
  const stream = new TextureStream(gl, 64);
  stream.upload({ width: 2, height: 2, getContext() {} });
  const callbacks = [];
  const original = globalThis.queueMicrotask;
  const presenter = createPresenter({
    currentGeneration: () => 0,
    present: () => stream.check(),
  });
  try {
    globalThis.queueMicrotask = (fn) => callbacks.push(fn);
    presenter.request(0);
  } finally {
    globalThis.queueMicrotask = original;
  }
  const waiting = presenter.whenPresented(0);
  let failure;
  assert.throws(
    () => stream.check(),
    (error) => {
      failure = error;
      return error.code === "initialization-failed";
    },
  );
  assert.throws(callbacks.shift(), (error) => error === failure);
  await assert.rejects(waiting, (error) => error === failure);
  await assert.rejects(
    presenter.whenPresented(0),
    (error) => error === failure,
  );

  stream.clear();
  assert.doesNotThrow(() => stream.check());
});

for (const failureStage of ["probe-context", "atlas-context", "atlas-copy"]) {
  test(`failed ${failureStage} construction releases its bitmap`, () => {
    const created = [];
    const context = {
      drawImage() {},
      getImageData() {
        return {};
      },
      clearRect() {},
      putImageData() {
        if (failureStage === "atlas-copy") throw Error("copy failure");
      },
    };
    const batch = new RasterBatch(8, (width, height) => {
      const canvas = {
        width,
        height,
        getContext() {
          if (
            (width === 1 && failureStage === "probe-context") ||
            (width === 8 && failureStage === "atlas-context")
          )
            return null;
          return context;
        },
      };
      created.push(canvas);
      return canvas;
    });
    const image = { width: 2, height: 2, getContext() {} };
    const operation = {
      generation: 0,
      kind: "draw",
      state: drawState(),
      source: {
        kind: "image",
        image,
        sourceRect: { x: 0, y: 0, width: 2, height: 2 },
        destinationRect: { x: 0, y: 0, width: 2, height: 2 },
        transform: IDENTITY,
      },
      sourceBounds: { x: 0, y: 0, width: 2, height: 2 },
      clip: null,
    };
    const original = globalThis.ImageData;
    globalThis.ImageData = class {
      constructor(data, width, height) {
        Object.assign(this, { data, width, height });
      }
    };
    try {
      if (failureStage === "atlas-copy")
        batch.append(operation, {
          width: 2,
          height: 2,
          data: new Uint8ClampedArray(16),
        });
      assert.throws(() => batch.appendImage(operation));
      const failed = created.at(-1);
      assert.equal(failed.width, 0);
      assert.equal(failed.height, 0);
      const solid = {
        ...operation,
        source: {
          kind: "rect",
          bounds: operation.sourceBounds,
          transform: IDENTITY,
          paint: { kind: "solid", color: [1, 0, 0, 1] },
        },
      };
      batch.appendOperation(solid);
      const pending = batch.take();
      assert.equal(pending.tiles.at(-1).operation, solid);
      assert.equal(pending.source === null, failureStage !== "atlas-copy");
      batch.dispose();
      assert.ok(
        created.every((canvas) => canvas.width === 0 && canvas.height === 0),
      );
    } finally {
      globalThis.ImageData = original;
      batch.dispose();
    }
  });
}
