/**
 * Deps: domain/agent-types.ts, domain/sop-consumption.ts, runtime/sop-consumption-context.ts
 * Used By: runtime/run-executor.ts
 * Last Updated: 2026-03-20
 */
import type { AgentRunRequest } from "../../domain/agent-types.js";
import type { SopConsumptionRecord, SopConsumptionResult } from "../../domain/sop-consumption.js";
import type { SopConsumptionBuildInput, SopConsumptionContextBuilder } from "../sop-consumption-context.js";

export interface LegacyRunBootstrapProviderOptions {
  consumptionContext?: Pick<SopConsumptionContextBuilder, "build">;
}

export class LegacyRunBootstrapProvider {
  private readonly consumptionContext?: Pick<SopConsumptionContextBuilder, "build">;

  constructor(options: LegacyRunBootstrapProviderOptions = {}) {
    this.consumptionContext = options.consumptionContext;
  }

  async prepare(request: AgentRunRequest): Promise<SopConsumptionResult> {
    const input = this.toConsumptionInput(request);
    if (!this.consumptionContext) {
      return this.fallbackConsumption(input.task, input.sopRunId, "consumption_not_configured");
    }
    return this.consumptionContext.build(input);
  }

  private toConsumptionInput(request: AgentRunRequest): SopConsumptionBuildInput {
    return {
      task: request.task.trim(),
      sopRunId: request.sopRunId?.trim(),
    };
  }

  private fallbackConsumption(task: string, sopRunId: string | undefined, reason: string): SopConsumptionResult {
    const record: SopConsumptionRecord = {
      enabled: false,
      originalTask: task,
      taskSource: "request",
      injected: false,
      selectionMode: sopRunId ? "pinned" : "none",
      pinnedRunId: sopRunId,
      candidateAssetIds: [],
      candidateCount: 0,
      guideSource: "none",
      fallbackUsed: true,
      fallbackReason: reason,
      usedHints: [],
      generatedAt: new Date().toISOString(),
    };

    return {
      taskForLoop: task,
      record,
    };
  }
}
