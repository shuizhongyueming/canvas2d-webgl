/** Test-only protocol; never re-export from the public declaration or package exports. */
export interface TestHooks {
  /** Scene FBO, RGBA8 straight sRGB, top-left row first; alpha=0 canonical RGB=0. */
  readScene(): { width: number; height: number; pixels: Uint8Array; generation: number };
  /** Wait for an already scheduled automatic present; does not force a submission. */
  whenPresented(generation: number): Promise<void>;
  resourceCounts(): Readonly<Record<string, number>>;
}
export interface CaseDefinition {
  readonly id: string;
  readonly requirements: readonly string[];
  readonly kind: 'semantic' | 'render' | 'combined';
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly fonts: readonly string[];
  /** Run independently against native or compat; no shared mutable globals. */
  run(adapter: CaseAdapter): void | Promise<void>;
}
export interface CaseAdapter {
  readonly context: unknown;
  readonly canvas: unknown;
  checkpoint(): Promise<void>;
}
export interface CaseResult {
  caseId: string;
  execution: 'executed' | 'blocked' | 'not-run';
  semantic: 'pass' | 'fail' | 'not-applicable';
  render: 'pending-review' | 'accepted' | 'rejected' | 'not-applicable';
  error?: string;
  artifacts?: { reference: string; actual: string; difference: string };
}
export interface ReviewRecord {
  caseId: string;
  runId: string;
  commit: string;
  environmentHash: string;
  /** Hash binds both real images, not just a mutable filename. */
  artifactHash: string;
  human: { reviewer: string; date: string; verdict: 'accepted' | 'rejected' };
  ai: { reviewer: string; date: string; verdict: 'accepted' | 'rejected'; notes: string };
}
export interface TestRun {
  schemaVersion: 1;
  runId: string;
  commit: string;
  scope: 'infrastructure-self-test' | 'compatibility';
  environment: {
    browser: string; gpu: string; dpr: number; fonts: readonly string[];
    date: string; platform: string;
  };
  requiredCaseIds: readonly string[];
  results: readonly CaseResult[];
}
