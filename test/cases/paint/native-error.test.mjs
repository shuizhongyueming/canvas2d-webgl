import test from "node:test";
import assert from "node:assert/strict";
import { webidlDouble } from "../../../dist/paint/native-error.js";

const typeError = (fn) => assert.throws(fn, TypeError);

test("webidlDouble follows ToNumber for ordinary coercions", () => {
  assert.equal(webidlDouble(2.5), 2.5);
  assert.equal(webidlDouble("3.5"), 3.5);
  assert.equal(webidlDouble(null), 0);
  assert.equal(webidlDouble(true), 1);
  assert.equal(webidlDouble(false), 0);
  assert.equal(webidlDouble({ valueOf: () => 4 }), 4);
  assert.ok(Number.isNaN(webidlDouble(undefined)));
  assert.ok(Number.isNaN(webidlDouble("nope")));
});

test("webidlDouble rejects every BigInt shape with the native TypeError", () => {
  typeError(() => webidlDouble(1n));
  // The wrapper form is the one Number(value) used to accept: it returns 1
  // there because the Number constructor special-cases a BigInt primitive.
  typeError(() => webidlDouble(Object(1n)));
  typeError(() => webidlDouble({ valueOf: () => 1n }));
  typeError(() => webidlDouble({ valueOf: () => ({}), toString: () => 1n }));
  typeError(() => webidlDouble(Symbol("s")));
});
