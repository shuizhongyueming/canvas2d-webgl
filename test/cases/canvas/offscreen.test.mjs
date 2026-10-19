import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveOffscreenFactory,
  validateOffscreenFactory,
} from "../../../dist/canvas/offscreen.js";

const fakeCanvas = (width, height, context = {}) => ({
  width,
  height,
  getContext: (type) => (type === "2d" ? context : null),
});

const fakeTarget = () => fakeCanvas(8, 6);

test("resolveOffscreenFactory requires an injection without a DOM", () => {
  assert.throws(
    () => resolveOffscreenFactory(undefined),
    (error) => error.code === "invalid-factory",
  );
});

test("resolveOffscreenFactory rejects a non-function injection", () => {
  assert.throws(
    () => resolveOffscreenFactory(42),
    (error) => error.code === "invalid-factory",
  );
});

test("resolveOffscreenFactory returns a usable injection unchanged", () => {
  const factory = (width, height) => fakeCanvas(width, height);
  assert.equal(resolveOffscreenFactory(factory), factory);
});

test("validateOffscreenFactory accepts independent legal canvases", () => {
  const probes = [];
  validateOffscreenFactory((width, height) => {
    const canvas = fakeCanvas(width, height);
    probes.push(canvas);
    return canvas;
  }, fakeTarget());
  assert.equal(probes.length, 2);
  assert.ok(probes.every((probe) => probe.width === 0 && probe.height === 0));
});

const rejects = (name, factory, code) =>
  test(`validateOffscreenFactory rejects ${name}`, () => {
    assert.throws(
      () => validateOffscreenFactory(factory, fakeTarget()),
      (error) => error.code === code,
    );
  });

rejects("a null return", () => null, "invalid-factory");
rejects("a plain object", () => ({}), "invalid-factory");
rejects("a canvas without getContext", () => ({ width: 4, height: 3 }), "invalid-factory");

test("validateOffscreenFactory rejects the target canvas itself", () => {
  const target = fakeTarget();
  assert.throws(
    () => validateOffscreenFactory(() => target, target),
    (error) => error.code === "invalid-factory",
  );
});

test("validateOffscreenFactory rejects a repeated canvas", () => {
  const shared = fakeCanvas(4, 3);
  assert.throws(
    () => validateOffscreenFactory(() => shared, fakeTarget()),
    (error) => error.code === "invalid-factory",
  );
});

test("validateOffscreenFactory rejects wrong dimensions", () => {
  assert.throws(
    () => validateOffscreenFactory(() => fakeCanvas(1, 1), fakeTarget()),
    (error) => error.code === "invalid-factory",
  );
});

test("validateOffscreenFactory rejects immutable dimensions", () => {
  const immutable = () => {
    const canvas = { height: 3, getContext: () => ({}) };
    Object.defineProperty(canvas, "width", { get: () => 4 });
    return canvas;
  };
  assert.throws(
    () => validateOffscreenFactory(immutable, fakeTarget()),
    (error) => error.code === "invalid-factory",
  );
});

test("validateOffscreenFactory rejects a throwing factory", () => {
  assert.throws(
    () =>
      validateOffscreenFactory(
        () => {
          throw new Error("boom");
        },
        fakeTarget(),
      ),
    (error) => error.code === "invalid-factory" && error.message.includes("boom"),
  );
});

test("validateOffscreenFactory reports a missing 2D capability", () => {
  assert.throws(
    () =>
      validateOffscreenFactory(
        () => fakeCanvas(4, 3, null),
        fakeTarget(),
      ),
    (error) => error.code === "capability-unavailable",
  );
});
