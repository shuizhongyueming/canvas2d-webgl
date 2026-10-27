import type { CompatContext, CompatCanvas } from "../../src/api.js";
/** Test-only protocol; never re-export from the public declaration or package exports. */
export interface TestHooks {
  /** Scene FBO, RGBA8 straight sRGB, top-left row first; alpha=0 canonical RGB=0. */
  readScene(): {
    width: number;
    height: number;
    pixels: Uint8Array;
    generation: number;
  };
  /** Wait for an already scheduled automatic present; does not force a submission. */
  whenPresented(generation: number): Promise<void>;
  resourceCounts(): Readonly<Record<string, number>>;
}
import type { CaseMetadata } from "../../src/contracts/support.js";
import type {
  CleanupRegistry,
  DisplayClassification,
  PreparedExecution,
} from "../live/contracts/index.js";
export type { DisplayClassification } from "../live/contracts/index.js";
export type { CaseMetadata } from "../../src/contracts/support.js";
export interface CaseDefinition extends CaseMetadata {
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly fonts: readonly string[];
  /**
   * 展示资格分类（issue #62）。render/combined 用例必须显式分类；
   * 缺失属于未分类，由目录票（#67）的漂移检查报错，网页不得默认纳入。
   * semantic 用例自动排除，无需填写。
   */
  readonly display?: DisplayClassification;
  /**
   * 可选准备扩展（issue #63）：加载用例级资源、等待静态素材，
   * 返回 prepared execution 供外层统一 start。旧用例无 prepare 时由执行票
   * 提供的迁移入口包装，run 语义不变。
   */
  prepare?(
    adapter: CaseAdapter,
    registry: CleanupRegistry,
  ): PreparedExecution | Promise<PreparedExecution>;
  /** Run independently against native or compat; no shared mutable globals. */
  run(adapter: CaseAdapter): void | Promise<void>;
}
export interface CaseAdapter {
  readonly context: CanvasRenderingContext2D | CompatContext<HTMLCanvasElement>;
  readonly canvas: HTMLCanvasElement | CompatCanvas<HTMLCanvasElement>;
  random(): number;
  assert(value: unknown, message?: string): void;
  observe(key: string, value: unknown): void;
  skip(reason: string): never;
  checkpoint(): Promise<void>;
}
export interface CaseResult {
  caseId: string;
  kind: CaseMetadata["kind"];
  execution: "executed" | "blocked" | "not-run";
  semantic: "pass" | "fail" | "not-applicable";
  render: "pending-review" | "accepted" | "rejected" | "not-applicable";
  error?: string;
  artifacts?: {
    reference: string;
    actual: string;
    difference: string;
    displayReference: string;
    displayActual: string;
    displayDifference: string;
  };
  artifactHash?: string;
}
export interface ReviewRecord {
  caseId: string;
  runId: string;
  commit: string;
  sourceHash: string;
  environmentHash: string;
  /** Hash binds both real images, not just a mutable filename. */
  artifactHash: string;
  human: { reviewer: string; date: string; verdict: "accepted" | "rejected" };
  ai: {
    reviewer: string;
    date: string;
    verdict: "accepted" | "rejected";
    notes: string;
  };
}
export interface TestRun {
  schemaVersion: 1;
  runId: string;
  commit: string;
  sourceHash: string;
  dirty: boolean;
  environmentHash: string;
  selectedCaseIds: readonly string[];
  cases: readonly (CaseMetadata & {
    width: number;
    height: number;
    fonts: readonly string[];
    seed: number;
  })[];
  scope: "infrastructure-self-test" | "compatibility";
  environment: {
    browser: string;
    gpu: string;
    dpr: number;
    fonts: readonly string[];
    date: string;
    platform: string;
  };
  requiredCaseIds: readonly string[];
  results: readonly CaseResult[];
}
