import test from "node:test";
import assert from "node:assert/strict";
import { diffPixels, hash } from "./evidence.mjs";
import { validateCases, requiredCatalog } from "./catalog.mjs";
test("a one-pixel error is localized without declaring rendering accepted", () => {
  const a = { width: 100, height: 100, data: Buffer.alloc(40000) };
  const b = { ...a, data: Buffer.from(a.data) };
  b.data[(24 * 100 + 17) * 4] = 1;
  const diff = diffPixels(a, b);
  assert.equal(diff.changedPixels, 1);
  assert.deepEqual(diff.bounds, { x: 17, y: 24, width: 1, height: 1 });
  assert.equal(diff.verdict, undefined);
  assert.notEqual(hash(a.data), hash(b.data));
});
test("case discovery rejects duplicates, unknown requirements and weakening required cases", () => {
  const c = {
    id: "one",
    kind: "render",
    requirements: ["CAN-01"],
    width: 10,
    height: 10,
    seed: 1,
    fonts: [],
    run() {},
  };
  assert.throws(
    () => validateCases([c, c], new Set(["CAN-01"]), []),
    /Duplicate/,
  );
  assert.throws(() => validateCases([c], new Set(), []), /Unknown requirement/);
  assert.throws(
    () => validateCases([{ ...c, kind: "semantic" }], new Set(["CAN-01"]), [c]),
    /metadata/,
  );
  assert.throws(
    () => validateCases([{ ...c, width: 0 }], new Set(["CAN-01"]), []),
    /dimensions/,
  );
});

test("every canonical required case can be registered, including brightness parentheses", () => {
  // Registration fixtures only: these are not executed compatibility cases.
  const cases = requiredCatalog.map((metadata) => ({
    ...metadata,
    width: 16,
    height: 16,
    seed: 1,
    fonts: [],
    run() {},
  }));
  const requirements = new Set(cases.flatMap((c) => c.requirements));
  assert.ok(
    cases.some((c) => c.id === "context.filter.value-brightness(120%25)"),
  );
  assert.doesNotThrow(() => validateCases(cases, requirements));
  for (const id of ["bad/id", "bad id", "bad?id", "bad#id"]) {
    assert.throws(
      () => validateCases([{ ...cases[0], id }], requirements),
      /Invalid case id/,
    );
  }
});
