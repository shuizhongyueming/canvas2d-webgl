import test from "node:test";
import assert from "node:assert/strict";
import { capture } from "./helpers.mjs";
import {
  createRepeatPattern,
  definePatternBitmap,
  isCompatPattern,
  isPatternBitmap,
  patternBitmapPixels,
} from "../../../dist/paint/pattern.js";

let nextId = 1;
const allocId = () => nextId++;
const image = (overrides = {}) => ({
  complete: true,
  naturalWidth: 3,
  naturalHeight: 5,
  ...overrides,
});

/**
 * Offscreen canvas double: records what the capture paints and answers a
 * deterministic getImageData payload (filled with `fill`), so tests can prove
 * the pattern owns the creation-time pixels.
 */
function canvasDouble(calls, fill = 7) {
  const canvas = {
    width: 0,
    height: 0,
    getContext(type) {
      if (type !== "2d") return null;
      return {
        drawImage(source, x, y) {
          calls.push({ op: "drawImage", source, x, y });
        },
        getImageData(x, y, width, height) {
          calls.push({ op: "getImageData", x, y, width, height });
          return { data: new Uint8ClampedArray(width * height * 4).fill(fill) };
        },
      };
    },
  };
  return canvas;
}
const factoryFor = (calls, fill) => (width, height) => {
  const canvas = canvasDouble(calls, fill);
  canvas.width = width;
  canvas.height = height;
  calls.push({ op: "create", width, height, canvas });
  return canvas;
};
const create = (img, repetition, createCanvas) =>
  createRepeatPattern(img, repetition, 2, allocId, createCanvas);

test("repeat pattern creation captures and freezes the creation-time bitmap", () => {
  const calls = [];
  const img = image();
  const pattern = create(img, "repeat", factoryFor(calls, 9));
  assert.ok(pattern);
  assert.deepEqual(
    calls.map(({ op }) => op),
    ["create", "drawImage", "getImageData"],
  );
  assert.equal(calls[0].width, 3, "offscreen canvas takes the natural size");
  assert.equal(calls[0].height, 5);
  assert.equal(calls[1].source, img, "the source image is drawn, not stored");
  assert.deepEqual([calls[2].width, calls[2].height], [3, 5]);
  const scratch = calls[0].canvas;
  assert.equal(scratch.width, 0, "scratch bitmap is released after capture");
  assert.equal(scratch.height, 0);

  const bitmap = pattern.image;
  assert.equal(bitmap.width, 3);
  assert.equal(bitmap.height, 5);
  assert.equal(bitmap.colorSpace, "srgb");
  assert.equal(bitmap.alpha, "straight");
  const pixels = patternBitmapPixels(bitmap);
  assert.ok(pixels instanceof Uint8ClampedArray);
  assert.equal(pixels.length, 3 * 5 * 4);
  assert.ok(
    pixels.every((value) => value === 9),
    "captured payload",
  );
  assert.ok(Object.isFrozen(bitmap));
  assert.equal(pattern.version, 0, "patterns never mutate after creation");

  const paint = pattern.snapshot();
  assert.equal(paint.kind, "repeat-pattern");
  assert.equal(paint.id, pattern.id);
  assert.equal(paint.version, 0);
  assert.equal(paint.image, bitmap, "snapshot shares the frozen bitmap");
  assert.ok(Object.isFrozen(paint));
  assert.ok(isCompatPattern(pattern));
  assert.ok(!isCompatPattern({}));
});

test("the captured bitmap is a copy: later source mutations cannot reach it", () => {
  const calls = [];
  const img = image();
  const pattern = create(img, "repeat", factoryFor(calls, 7));
  // Simulate the src-swap probe: the image now decodes different pixels, and
  // any re-read would observe them; the pattern must keep the first payload.
  img.naturalWidth = 8;
  const stale = create(img, "repeat", factoryFor([], 200));
  assert.ok(patternBitmapPixels(pattern.image).every((value) => value === 7));
  assert.ok(patternBitmapPixels(stale.image).every((value) => value === 200));
  assert.equal(stale.image.width, 8);
  assert.notEqual(
    patternBitmapPixels(pattern.image),
    patternBitmapPixels(stale.image),
  );
});

test("a missing factory fails capability-unavailable only at the capture point", () => {
  const error = capture(() => create(image(), "repeat"));
  assert.equal(error.code, "capability-unavailable");
  // Native validation still runs first: bad input and unusable images never
  // reach the capture, so they keep their native outcomes without a factory.
  assert.throws(() => create({}, "repeat"), TypeError);
  assert.equal(capture(() => create(image(), "bogus")).name, "SyntaxError");
  assert.equal(
    capture(() => create(image(), "repeat-x")).code,
    "unsupported-api",
  );
  assert.equal(create(image({ complete: false }), "repeat"), null);
});

test("an offscreen canvas without a 2D context fails capability-unavailable", () => {
  const made = [];
  const bare = (width, height) => {
    const canvas = { width, height, getContext: () => null };
    made.push(canvas);
    return canvas;
  };
  const error = capture(() => create(image(), "repeat", bare));
  assert.equal(error.code, "capability-unavailable");
  assert.equal(made.length, 1);
  assert.equal(
    made[0].width,
    0,
    "the scratch canvas is released even when no context exists",
  );
  assert.equal(made[0].height, 0);
});

test("null and empty repetition mean repeat; other modes are unsupported", () => {
  assert.ok(create(image(), null, factoryFor([])));
  assert.ok(create(image(), "", factoryFor([])));
  assert.ok(create(image(), "repeat", factoryFor([])));
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
  const canvasLike = {
    getContext: () => null,
    width: 2,
    height: 2,
    [Symbol.toStringTag]: "HTMLCanvasElement",
  };
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
  // An object that merely walks like a canvas is not one (native TypeError).
  const fakeCanvas = { getContext: () => null, width: 2, height: 2 };
  assert.throws(() => create(fakeCanvas, "repeat"), TypeError);
  // Image type is validated before the repetition string (native order).
  assert.throws(() => create({}, "bogus"), TypeError);
});

test("DOM-branded images are accepted cross-realm, plain objects rejected", () => {
  // With the HTMLImageElement global present, the structural fallback is off:
  // duck-typed objects are rejected like native, while objects carrying the
  // interface brand (any realm) pass the type check.
  globalThis.HTMLImageElement = class HTMLImageElement {};
  try {
    assert.throws(() => create(image(), "repeat"), TypeError);
    const branded = image({ [Symbol.toStringTag]: "HTMLImageElement" });
    assert.ok(
      create(branded, "repeat", factoryFor([])),
      "cross-realm brand tag is honored",
    );
    assert.equal(
      create(new globalThis.HTMLImageElement(), "repeat"),
      null,
      "platform instance without a loaded bitmap is unusable, not a type error",
    );
  } finally {
    delete globalThis.HTMLImageElement;
  }
});

test("ImageData is not a legal pattern source", () => {
  // Native throws a TypeError: ImageData is absent from the source union.
  globalThis.ImageData = class ImageData {};
  try {
    const error = capture(() => create(new globalThis.ImageData(), "repeat"));
    assert.equal(error.name, "TypeError");
    assert.equal(error.code, undefined, "not unsupported-api");
  } finally {
    delete globalThis.ImageData;
  }
});

test("unusable images return null, broken images throw InvalidStateError", () => {
  assert.equal(
    create(image({ complete: false, naturalWidth: 0 }), "repeat"),
    null,
  );
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
  const pattern = create(image(), "repeat", factoryFor([]));
  const error = capture(() => pattern.setTransform());
  assert.equal(error.code, "unsupported-api");
});

test("the reachable bitmap surface carries no mutable pixels", () => {
  const calls = [];
  const pattern = create(image(), "repeat", factoryFor(calls, 9));
  const bitmap = pattern.image;
  // The old repro `pattern.image.data[0] = 255` is gone: the descriptor is
  // all primitives, deeply frozen, and holds no buffer at all.
  assert.deepEqual(Object.getOwnPropertyNames(bitmap).sort(), [
    "alpha",
    "colorSpace",
    "height",
    "width",
  ]);
  assert.equal(bitmap.data, undefined);
  assert.ok(Object.isFrozen(bitmap));
  assert.throws(() => {
    bitmap.width = 7;
  }, TypeError);
  assert.throws(() => {
    bitmap.data = new Uint8ClampedArray(4);
  }, TypeError);
  assert.throws(() => {
    bitmap.data[0] = 255;
  }, TypeError);
  // The snapshot keeps sharing the same frozen descriptor, and the canonical
  // pixels are untouched by everything attempted above.
  const snapshot = pattern.snapshot();
  assert.equal(snapshot.image, bitmap, "snapshot shares the frozen descriptor");
  assert.ok(patternBitmapPixels(bitmap).every((value) => value === 9));
});

test("definePatternBitmap copies the payload and brands the descriptor", () => {
  const source = new Uint8ClampedArray([1, 2, 3, 4]);
  const bitmap = definePatternBitmap(1, 1, source);
  assert.ok(Object.isFrozen(bitmap));
  source[0] = 255;
  assert.equal(
    patternBitmapPixels(bitmap)[0],
    1,
    "caller-side mutation cannot reach the canonical copy",
  );
  assert.ok(isPatternBitmap(bitmap));
  const lookalike = Object.freeze({
    width: 1,
    height: 1,
    colorSpace: "srgb",
    alpha: "straight",
  });
  assert.ok(
    !isPatternBitmap(lookalike),
    "a structural lookalike is not a pattern bitmap",
  );
  const error = capture(() => patternBitmapPixels(lookalike));
  assert.equal(error.code, "contract-violation");
});

test("a tainted source's SecurityError propagates unchanged from createPattern", () => {
  // Decision #41 route A: capture reads pixels back at creation, so a tainted
  // canvas fails synchronously here instead of at a later readback. The native
  // exception object must propagate as-is, not wrapped as capability-unavailable.
  const tainted = new DOMException("tainted canvas", "SecurityError");
  const canvas = {
    width: 0,
    height: 0,
    getContext(type) {
      if (type !== "2d") return null;
      return {
        drawImage() {},
        getImageData() {
          throw tainted;
        },
      };
    },
  };
  const factory = (width, height) => {
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  const error = capture(() => create(image(), "repeat", factory));
  assert.equal(error, tainted, "the native exception object is not wrapped");
  assert.equal(error.name, "SecurityError");
  assert.equal(canvas.width, 0, "scratch canvas is released on the way out");
  assert.equal(canvas.height, 0);
});
