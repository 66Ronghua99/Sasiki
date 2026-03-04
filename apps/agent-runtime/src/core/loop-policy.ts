export interface LoopPolicyConfig {
  maxSteps: number;
  maxStallSteps: number;
  maxFailures: number;
  toolTimeoutMs: number;
}

export class LoopPolicy {
  readonly maxSteps: number;
  readonly maxStallSteps: number;
  readonly maxFailures: number;
  readonly toolTimeoutMs: number;

  constructor(config?: Partial<LoopPolicyConfig>) {
    this.maxSteps = config?.maxSteps ?? 20;
    this.maxStallSteps = config?.maxStallSteps ?? 3;
    this.maxFailures = config?.maxFailures ?? 3;
    this.toolTimeoutMs = config?.toolTimeoutMs ?? 15_000;
  }

  shouldStopForFailures(failureCount: number): boolean {
    return failureCount >= this.maxFailures;
  }

  shouldStopForStalls(stallCount: number): boolean {
    return stallCount >= this.maxStallSteps;
  }
}
