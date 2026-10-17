import test from "node:test";
import assert from "node:assert/strict";
import { waitFonts, observationValue } from "./browser.js";
test("font gate waits for loads and ready, rejecting missing, failed and never-ready fonts", async () => {
  let loaded = false;
  await waitFonts(
    ["16px test"],
    {
      load: async () => {
        loaded = true;
      },
      ready: Promise.resolve(),
      check: () => loaded,
    },
    100,
  );
  await assert.rejects(
    waitFonts(
      ["16px test"],
      { load: async () => {}, ready: Promise.resolve(), check: () => false },
      100,
    ),
    /font-not-ready/,
  );
  await assert.rejects(
    waitFonts(
      ["16px test"],
      {
        load: async () => {
          throw Error("font failed");
        },
        ready: Promise.resolve(),
        check: () => true,
      },
      100,
    ),
    /font failed/,
  );
  await assert.rejects(
    waitFonts(
      ["16px test"],
      {
        load: () => new Promise(() => {}),
        ready: Promise.resolve(),
        check: () => true,
      },
      10,
    ),
    /font-timeout/,
  );
});

test("semantic observations cannot silently collapse non-finite or undefined values", () => {
  for (const value of [
    NaN,
    Infinity,
    -0,
    undefined,
    { x: undefined },
    [NaN],
    new Date(),
  ])
    assert.throws(() => observationValue(value), /lossless JSON/);
  assert.deepEqual(observationValue({ width: 1, identity: true }), {
    width: 1,
    identity: true,
  });
});
