import test from "node:test";
import assert from "node:assert/strict";
import { contextDescriptors } from "../../dist/contracts/features.js";

test("registered feature dispatches with its receiver while unknown names stay absent", () => {
  const descriptors = contextDescriptors([
    {
      id: "rect",
      members: {
        fillRect: {
          value() {
            return this;
          },
        },
      },
    },
  ]);
  const context = Object.create(null, descriptors);
  assert.equal(context.fillRect(), context);
  assert.throws(() => context.drawImage(), { code: "not-implemented" });
  assert.throws(() => context.getImageData(), { code: "unsupported-api" });
  assert.throws(
    () => {
      context.shadowBlur = 2;
    },
    { code: "unsupported-api" },
  );
  assert.equal(context.fillRekt, undefined);
  assert.throws(() => context.fillRekt(), TypeError);
});

test("duplicate ownership, unsupported registration and malformed descriptors are rejected", () => {
  const feature = { id: "rect", members: { fillRect: { value() {} } } };
  assert.throws(() => contextDescriptors([feature, feature]), {
    code: "contract-violation",
  });
  assert.throws(
    () => contextDescriptors([{ id: "image", members: feature.members }]),
    { code: "contract-violation" },
  );
  assert.throws(
    () =>
      contextDescriptors([
        { id: "context", members: { getImageData: { value() {} } } },
      ]),
    { code: "contract-violation" },
  );
  assert.throws(
    () =>
      contextDescriptors([
        { id: "rect", members: { fillRect: { value: 42 } } },
      ]),
    { code: "contract-violation" },
  );
});
