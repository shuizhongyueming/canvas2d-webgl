import test from "node:test";
import assert from "node:assert/strict";
import { createCompatCanvas } from "../../dist/index.js";
import {
  createCompatError,
  ERROR_CODES,
  rollbackInitialization,
} from "../../dist/contracts/errors.js";

test("factory rejects an invalid target synchronously", () => {
  // A non-canvas target fails fast with a stable code; the real factory must
  // read the target to validate it, so the input here is simply unusable.
  assert.throws(() => createCompatCanvas({}), { code: "invalid-target" });
  assert.throws(() => createCompatCanvas(null), { code: "invalid-target" });
});

test("stable errors identify the capability without converting native exceptions", () => {
  const error = createCompatError(ERROR_CODES.UNSUPPORTED_API, "getImageData");
  assert.equal(error.code, "unsupported-api");
  assert.match(error.message, /getImageData/);
  assert.ok(error instanceof Error);
});

test("initialization rollback releases in reverse order and preserves original failure", () => {
  const order = [],
    original = new Error("allocation failed");
  const cleanups = [
    () => order.push("first"),
    () => {
      order.push("second");
      throw Error("cleanup");
    },
    () => order.push("third"),
  ];
  assert.throws(
    () => rollbackInitialization(original, cleanups),
    (e) => e === original,
  );
  assert.deepEqual(order, ["third", "second", "first"]);
  assert.equal(cleanups.length, 0);
});
