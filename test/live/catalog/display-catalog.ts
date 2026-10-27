/**
 * 实时渲染对比工具的展示目录核心（issue #67）。
 * 浏览器/Node 共享：不引入 Node 内置模块，输入为 CaseDefinition 数组，
 * 输出为可 JSON 序列化的目录投影。校验失败抛错并纳入仓库验证流程。
 */
import type { CaseDefinition, CaseMetadata } from "../../types/testing.js";
import type { DisplayClassification } from "../contracts/index.js";

/** 完整用例元数据中最小的必需形状；与 harness catalog 的条目对齐。 */
export type CatalogEntry = Pick<
  CaseDefinition,
  "id" | "kind" | "width" | "height" | "requirements" | "seed" | "fonts"
> &
  Partial<Pick<CaseDefinition, "display">>;

/** 服务/UI 消费的网页目录条目；只含可序列化字段，不泄露 run/prepare。 */
export type LiveDisplayEntry = {
  readonly id: string;
  readonly kind: CaseMetadata["kind"];
  readonly width: number;
  readonly height: number;
  readonly requirements: readonly string[];
  readonly seed: number;
  readonly fonts: readonly string[];
  /** 展示分类；observation 为空在类型层不可构造，运行时仍校验。 */
  readonly display: Extract<DisplayClassification, { status: "included" }>;
};

/** 分类统计：候选 = render + combined；semantic 自动排除不计入。 */
export interface DisplayCatalogStats {
  readonly candidates: number;
  readonly included: number;
  readonly excluded: number;
}

/** 目录漂移检查发现的单条问题；kind 标明违反的契约。 */
export interface DisplayCatalogIssue {
  readonly caseId: string;
  readonly kind:
    | "missing-classification"
    | "invalid-classification"
    | "empty-observation"
    | "empty-reason"
    | "duplicate-id"
    | "semantic-classified";
  readonly message: string;
}

export class DisplayCatalogError extends Error {
  readonly issues: readonly DisplayCatalogIssue[];

  constructor(issues: readonly DisplayCatalogIssue[]) {
    super(
      `展示目录校验失败（${issues.length} 项）：\n` +
        issues.map((issue) => `- ${issue.caseId}: ${issue.message}`).join("\n"),
    );
    this.name = "DisplayCatalogError";
    this.issues = issues;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * 校验展示分类契约（issue #62）：render/combined 必须显式分类；
 * included 需非空观察重点，excluded 需非空原因；semantic 自动排除、
 * 若填写了分类则同样报错，避免语义分裂。
 */
export function validateDisplayClassifications(
  cases: readonly CatalogEntry[],
): readonly DisplayCatalogIssue[] {
  const issues: DisplayCatalogIssue[] = [];
  const ids = new Set<string>();
  for (const entry of cases) {
    if (ids.has(entry.id))
      issues.push({
        caseId: entry.id,
        kind: "duplicate-id",
        message: "目录中出现重复用例 ID",
      });
    ids.add(entry.id);

    if (entry.kind === "semantic") {
      if (entry.display !== undefined)
        issues.push({
          caseId: entry.id,
          kind: "semantic-classified",
          message: "semantic 用例自动排除，不得填写展示分类",
        });
      continue;
    }
    if (entry.kind !== "render" && entry.kind !== "combined") {
      issues.push({
        caseId: entry.id,
        kind: "invalid-classification",
        message: `未知用例 kind：${String(entry.kind)}`,
      });
      continue;
    }
    const display = entry.display;
    if (display === undefined || display === null) {
      issues.push({
        caseId: entry.id,
        kind: "missing-classification",
        message: "render/combined 用例缺少展示分类",
      });
      continue;
    }
    if (display.status === "included") {
      if (!isNonEmptyString(display.observation))
        issues.push({
          caseId: entry.id,
          kind: "empty-observation",
          message: "展示用例缺少非空观察重点",
        });
      if ("reason" in display)
        issues.push({
          caseId: entry.id,
          kind: "invalid-classification",
          message: "included 分类不得携带 reason 字段",
        });
      continue;
    }
    if (display.status === "excluded") {
      if (!isNonEmptyString(display.reason))
        issues.push({
          caseId: entry.id,
          kind: "empty-reason",
          message: "排除用例缺少非空原因",
        });
      if ("observation" in display)
        issues.push({
          caseId: entry.id,
          kind: "invalid-classification",
          message: "excluded 分类不得携带 observation 字段",
        });
      continue;
    }
    issues.push({
      caseId: entry.id,
      kind: "invalid-classification",
      message: `非法展示分类：${String((display as { status?: unknown }).status)}`,
    });
  }
  return issues;
}

/** 校验并在失败时抛 DisplayCatalogError；成功时返回原数组。 */
export function assertDisplayCatalog<T extends CatalogEntry>(
  cases: readonly T[],
): readonly T[] {
  const issues = validateDisplayClassifications(cases);
  if (issues.length) throw new DisplayCatalogError(issues);
  return cases;
}

/**
 * 派生网页展示目录投影：只保留显式 included 的 render/combined 用例，
 * 只携带可序列化字段；运行失败或暂缺执行能力不影响入选（issue #62）。
 */
export function projectDisplayCatalog(
  cases: readonly CatalogEntry[],
): readonly LiveDisplayEntry[] {
  assertDisplayCatalog(cases);
  const projection: LiveDisplayEntry[] = [];
  for (const entry of cases) {
    if (entry.kind === "semantic") continue;
    if (entry.display?.status !== "included") continue;
    projection.push({
      id: entry.id,
      kind: entry.kind,
      width: entry.width,
      height: entry.height,
      requirements: [...entry.requirements],
      seed: entry.seed,
      fonts: [...entry.fonts],
      display: {
        status: "included",
        observation: entry.display.observation,
      },
    });
  }
  return projection;
}

/** 当前完整目录的真实分类统计；semantic 不计入候选。 */
export function displayCatalogStats(
  cases: readonly CatalogEntry[],
): DisplayCatalogStats {
  assertDisplayCatalog(cases);
  let included = 0;
  let excluded = 0;
  for (const entry of cases) {
    if (entry.kind === "semantic") continue;
    if (entry.display?.status === "included") included += 1;
    else excluded += 1;
  }
  return { candidates: included + excluded, included, excluded };
}
