/**
 * Deps: application/compact/interactive-sop-compact.ts, application/shell/workflow-contract.ts
 * Used By: index.ts
 * Last Updated: 2026-03-21
 */
import type { InteractiveSopCompactResult } from "./interactive-sop-compact.js";
import type { HostedWorkflow } from "../shell/workflow-contract.js";

export interface CompactWorkflowService {
  compact(runId: string): Promise<InteractiveSopCompactResult>;
}

export interface CompactWorkflowOptions {
  service: CompactWorkflowService;
  runId: string;
}

export class CompactWorkflow implements HostedWorkflow<InteractiveSopCompactResult> {
  private readonly service: CompactWorkflowService;
  private readonly runId: string;

  constructor(options: CompactWorkflowOptions) {
    this.service = options.service;
    this.runId = options.runId;
  }

  async prepare(): Promise<void> {
    // Compact is an offline workflow over recorded artifacts, so host preparation is a no-op.
  }

  async execute(): Promise<InteractiveSopCompactResult> {
    return this.service.compact(this.runId);
  }

  async requestInterrupt(_signal: "SIGINT" | "SIGTERM"): Promise<boolean> {
    return false;
  }

  async dispose(): Promise<void> {
    // No runtime resources are owned here.
  }
}

export function createCompactWorkflow(options: CompactWorkflowOptions): CompactWorkflow {
  return new CompactWorkflow(options);
}

export function createCompactWorkflowFactory(
  service: CompactWorkflowService
): (runId: string) => HostedWorkflow<InteractiveSopCompactResult> {
  return (runId: string): HostedWorkflow<InteractiveSopCompactResult> =>
    createCompactWorkflow({
      service,
      runId,
    });
}
