import test from "node:test";
import assert from "node:assert/strict";
import { createCompatCanvas } from "../../../dist/canvas/factory.js";

/** A legal mutable offscreen canvas double honoring requested dimensions. */
function offscreenCanvas(width, height) {
  return { width, height, getContext: () => null };
}

/** A target whose webgl lookup is caller-controlled. */
function stubTarget({ webgl = null, width = 8, height = 6 } = {}) {
  return {
    width,
    height,
    getContext: (type) => (type === "webgl" ? webgl : null),
  };
}

test("options validation follows the WebIDL dictionary rules", () => {
  // Non-object and non-function callbacks throw plain TypeErrors before any
  // other validation step runs.
  assert.throws(
    () => createCompatCanvas(stubTarget(), 42),
    (error) =>
      error instanceof TypeError &&
      /options must be an object/.test(error.message),
  );
  assert.throws(
    () => createCompatCanvas(stubTarget(), { onContextLost: "nope" }),
    (error) =>
      error instanceof TypeError &&
      /onContextLost must be a function/.test(error.message),
  );
  assert.throws(
    () => createCompatCanvas(stubTarget(), { onContextRestored: 7 }),
    (error) =>
      error instanceof TypeError &&
      /onContextRestored must be a function/.test(error.message),
  );
});

test("a target without getContext or numeric dimensions reports invalid-target", () => {
  for (const bad of [
    null,
    undefined,
    "canvas",
    42,
    {},
    { width: 8, height: 6 },
    { getContext: () => null, width: 8 },
    { getContext: () => null, height: 6 },
    { getContext: "nope", width: 8, height: 6 },
    { getContext: () => null, width: "8", height: 6 },
  ]) {
    assert.throws(() => createCompatCanvas(bad), { code: "invalid-target" });
  }
});

test("without a DOM, a missing offscreen injection reports invalid-factory first", () => {
  // Node has no document, so the injection is mandatory: the usage error
  // surfaces before GPU acquisition ever runs.
  assert.throws(() => createCompatCanvas(stubTarget(), undefined), {
    code: "invalid-factory",
  });
  assert.throws(
    () => createCompatCanvas(stubTarget(), { createOffscreenCanvas: 42 }),
    { code: "invalid-factory" },
  );
});

test("a legal injection whose offscreen canvases lack a 2d context reports capability-unavailable", () => {
  // validateOffscreenFactory proves a 2d context on each probe before the GPU
  // acquisition runs; a canvas without one is a platform capability failure.
  assert.throws(
    () =>
      createCompatCanvas(stubTarget({ webgl: null }), {
        createOffscreenCanvas: offscreenCanvas,
      }),
    { code: "capability-unavailable" },
  );
  // With a working 2d context the proof passes and the missing WebGL reports.
  const with2d = (width, height) => ({
    width,
    height,
    getContext: (type) => (type === "2d" ? { filter: "none" } : null),
  });
  assert.throws(
    () =>
      createCompatCanvas(stubTarget({ webgl: null }), {
        createOffscreenCanvas: with2d,
      }),
    { code: "webgl-unavailable" },
  );
});

test("a legal injection that cannot honor dimensions reports invalid-factory", () => {
  assert.throws(
    () =>
      createCompatCanvas(stubTarget(), {
        createOffscreenCanvas: () => ({
          width: 9,
          height: 9,
          getContext: () => null,
        }),
      }),
    { code: "invalid-factory" },
  );
});

test("an injected offscreen factory is proven before GPU acquisition", () => {
  let calls = 0;
  assert.throws(
    () =>
      createCompatCanvas(stubTarget(), {
        createOffscreenCanvas() {
          calls += 1;
          return offscreenCanvas(9, 9);
        },
      }),
    { code: "invalid-factory" },
  );
  assert.ok(calls >= 1, "the factory was consulted during validation");
});

test("options and target errors never consult the injected factory", () => {
  let consulted = false;
  const spy = () => {
    consulted = true;
    return offscreenCanvas(1, 1);
  };
  assert.throws(
    () => createCompatCanvas(null, { createOffscreenCanvas: spy }),
    {
      code: "invalid-target",
    },
  );
  assert.throws(
    () =>
      createCompatCanvas(stubTarget(), {
        onContextLost: 3,
        createOffscreenCanvas: spy,
      }),
    TypeError,
  );
  assert.equal(consulted, false);
});
