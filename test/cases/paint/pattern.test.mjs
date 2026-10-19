import test from "node:test";
import assert from "node:assert/strict";
import { capture } from "./helpers.mjs";
import { createRepeatPattern, isCompatPattern } from "../../../dist/paint/pattern.js";

let nextId = 1;
const allocId = () => nextId++;
const image = (overrides = {}) => ({
  complete: true,
  naturalWidth: 3,
  naturalHeight: 5,
  ...overrides,
});
const create = (img, repetition) =>
  createRepeatPattern(img, repetition, 2, allocId);

test("repeat pattern creation captures the bitmap description", () => {
  const img = image();
  const pattern = create(img, "repeat");
  assert.ok(pattern);
  assert.equal(pattern.width, 3);
  assert.equal(pattern.height, 5);
  assert.equal(pattern.version, 0, "patterns never mutate after creation");
  const paint = pattern.snapshot();
  assert.equal(paint.kind, "repeat-pattern");
  assert.equal(paint.id, pattern.id);
  assert.equal(paint.version, 0);
  assert.equal(paint.image, img);
  assert.equal(paint.width, 3);
  assert.equal(paint.height, 5);
  assert.ok(Object.isFrozen(paint));
  assert.ok(isCompatPattern(pattern));
  assert.ok(!isCompatPattern({}));
});

test("null and empty repetition mean repeat; other modes are unsupported", () => {
  assert.ok(create(image(), null));
  assert.ok(create(image(), ""));
  assert.ok(create(image(), "repeat"));
  for (const mode of ["repeat-x", "repeat-y", "no-repeat"]) {
    const error = capture(() => create(image(), mode));
    assert.equal(error.code, "unsupported-api", mode);
  }
  for (const mode of ["bogus", "REPEAT", "Repeat", undefined]) {
    const error = capture(() => create(image(), mode));
    assert.equal(error.name, "SyntaxError", String(mode));
    assert.equal(error.code, 12, String(mode));
  }
});

test("canvas sources and wrong types follow the documented error order", () => {
  const canvasLike = { getContext: () => null, width: 2, height: 2 };
  const error = capture(() => create(canvasLike, "repeat"));
  assert.equal(error.code, "unsupported-api");
  // The canvas exclusion is reported before repetition validation.
  assert.equal(
    capture(() => create(canvasLike, "bogus")).code,
    "unsupported-api",
  );
  for (const junk of [{}, [], 5, "image", true, null, undefined]) {
    assert.throws(() => create(junk, "repeat"), TypeError);
  }
  // Image type is validated before the repetition string (native order).
  assert.throws(() => create({}, "bogus"), TypeError);
});

test("unusable images return null, broken images throw InvalidStateError", () => {
  assert.equal(create(image({ complete: false, naturalWidth: 0 }), "repeat"), null);
  assert.equal(
    create(image({ naturalWidth: 0, naturalHeight: 0 }), "repeat"),
    null,
    "no source ever set",
  );
  const broken = capture(() =>
    create(
      image({ naturalWidth: 0, naturalHeight: 0, currentSrc: "data:,x" }),
      "repeat",
    ),
  );
  assert.equal(broken.name, "InvalidStateError");
  assert.equal(broken.code, 11);
  // Repetition is validated before usability (native order).
  const error = capture(() =>
    create(
      image({ naturalWidth: 0, naturalHeight: 0, currentSrc: "data:,x" }),
      "bogus",
    ),
  );
  assert.equal(error.name, "SyntaxError");
});

test("arity violations throw TypeError", () => {
  assert.throws(
    () => createRepeatPattern(undefined, undefined, 0, allocId),
    TypeError,
  );
  assert.throws(
    () => createRepeatPattern(image(), undefined, 1, allocId),
    TypeError,
  );
});

test("setTransform is explicitly unsupported", () => {
  const pattern = create(image(), "repeat");
  const error = capture(() => pattern.setTransform());
  assert.equal(error.code, "unsupported-api");
});
