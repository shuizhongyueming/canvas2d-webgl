import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  DisplayCatalogError,
  displayCatalogStats,
  projectDisplayCatalog,
  validateDisplayClassifications,
} from "../../../dist/live/catalog/display-catalog.js";
import {
  loadCatalog,
  requiredCatalog,
  requiredCases,
  validateDisplayCatalog,
} from "../../harness/catalog.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));

function entry(overrides) {
  return {
    id: "demo.case",
    kind: "render",
    width: 8,
    height: 8,
    seed: 1,
    fonts: [],
    requirements: ["context.fillRect"],
    display: { status: "included", observation: "观察重点" },
    ...overrides,
  };
}

test("render/combined 缺分类、空说明、空原因、非法分类均被检出", () => {
  const cases = [
    entry({ id: "a.missing", display: undefined }),
    entry({
      id: "b.empty-observation",
      display: { status: "included", observation: "  " },
    }),
    entry({
      id: "c.empty-reason",
      display: { status: "excluded", reason: "" },
    }),
    entry({ id: "d.invalid", display: { status: "maybe" } }),
    entry({ id: "e.ok", display: { status: "excluded", reason: "原因" } }),
  ];
  const kinds = validateDisplayClassifications(cases).map(
    (issue) => issue.kind,
  );
  assert.deepEqual(kinds, [
    "missing-classification",
    "empty-observation",
    "empty-reason",
    "invalid-classification",
  ]);
});

test("semantic 自动排除：无需分类，填写分类反而报错", () => {
  assert.deepEqual(
    validateDisplayClassifications([
      entry({ id: "s.plain", kind: "semantic", display: undefined }),
    ]),
    [],
  );
  const issues = validateDisplayClassifications([
    entry({ id: "s.tagged", kind: "semantic" }),
  ]);
  assert.deepEqual(
    issues.map((issue) => issue.kind),
    ["semantic-classified"],
  );
});

test("重复 ID 报错；assertDisplayCatalog 抛出汇总错误", () => {
  const cases = [entry({ id: "dup.case" }), entry({ id: "dup.case" })];
  const issues = validateDisplayClassifications(cases);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, "duplicate-id");
  assert.throws(
    () => projectDisplayCatalog(cases),
    (error) =>
      error instanceof DisplayCatalogError && error.issues.length === 1,
  );
});

test("网页投影只含 included 的可序列化字段，不泄露 run/prepare", async () => {
  const catalog = await loadCatalog(root);
  const projection = projectDisplayCatalog(catalog);
  assert.ok(projection.length > 0);
  const includedIds = new Set(
    catalog
      .filter(
        (entry) =>
          entry.kind !== "semantic" && entry.display?.status === "included",
      )
      .map((entry) => entry.id),
  );
  // 投影与完整目录的 included 集合一一对应，不静默遗漏也不多加。
  assert.equal(projection.length, includedIds.size);
  for (const item of projection) {
    assert.ok(includedIds.has(item.id), `投影条目在目录中存在: ${item.id}`);
    assert.equal(item.display.status, "included");
    assert.ok(item.display.observation.trim().length > 0);
    assert.equal(typeof item.run, "undefined");
    assert.equal(typeof item.prepare, "undefined");
    assert.equal(typeof item.module, "undefined");
  }
  // 可整体序列化往返（函数/资源无法通过 JSON）。
  const roundTripped = JSON.parse(JSON.stringify(projection));
  assert.deepEqual(roundTripped, projection);
});

test("当前真实分类统计：候选 161、纳入 154、排除 7；排除恰为决议七个反例", async () => {
  const catalog = await loadCatalog(root);
  const stats = displayCatalogStats(catalog);
  assert.deepEqual(stats, { candidates: 161, included: 154, excluded: 7 });
  const excluded = catalog
    .filter((entry) => entry.display?.status === "excluded")
    .map((entry) => entry.id)
    .sort();
  assert.deepEqual(excluded, [
    "ACC-05.dispose-clears-assets-and-present",
    "ACC-05.loss-clears-assets",
    "ACC-05.resize-clears-assets-and-clip",
    "LIFE-01.dispose-pending-present",
    "LIFE-02.loss-before-present",
    "LIFE-03.restore-empty-generation",
    "clip.lifecycle-restore-discards-clip",
  ]);
});

test("新增候选未分类即漂移：validateDisplayCatalog 拒绝并报错", async () => {
  const catalog = await loadCatalog(root);
  validateDisplayCatalog(catalog);
  const drifted = [
    ...catalog,
    entry({ id: "drift.uncategorized", display: undefined }),
  ];
  assert.throws(
    () => validateDisplayCatalog(drifted),
    /drift\.uncategorized.*缺少展示分类/,
  );
});

test("requiredCases 与自动测试全集不因展示过滤而缩减", async () => {
  const catalog = await loadCatalog(root);
  const required = requiredCases(catalog, false);
  // 自动测试全集 = requiredCatalog + 目录其余用例，不过滤任何展示排除项。
  assert.equal(required.length, catalog.length);
  for (const canonical of requiredCatalog)
    assert.ok(
      required.some((entry) => entry.id === canonical.id),
      `required case kept: ${canonical.id}`,
    );
  const projection = projectDisplayCatalog(catalog);
  const projectionIds = new Set(projection.map((entry) => entry.id));
  assert.ok(
    required.some((entry) => !projectionIds.has(entry.id)),
    "展示排除的用例仍保留在自动测试全集",
  );
});
