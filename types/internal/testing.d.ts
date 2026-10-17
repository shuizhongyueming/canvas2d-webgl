import type { CompatContext, CompatCanvas } from "../index.js";
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
export interface CaseMetadata {
  readonly id: string;
  readonly requirements: readonly string[];
  readonly kind: "semantic" | "render" | "combined";
}
export interface CaseDefinition extends CaseMetadata {
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly fonts: readonly string[];
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
