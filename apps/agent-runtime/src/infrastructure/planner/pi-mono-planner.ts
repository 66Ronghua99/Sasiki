import type { Planner, PlannerContext } from "../../contracts/planner.js";
import type { PlannedAction } from "../../domain/agent-types.js";
import { RuleBasedPlanner } from "./rule-based-planner.js";

export interface PiMonoPlannerConfig {
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export class PiMonoPlanner implements Planner {
  private readonly config: PiMonoPlannerConfig;
  private readonly fallback: RuleBasedPlanner;
  private piInitialized = false;

  constructor(config: PiMonoPlannerConfig) {
    this.config = config;
    this.fallback = new RuleBasedPlanner();
  }

  async initialize(): Promise<void> {
    if (this.piInitialized) {
      return;
    }

    // Migration-first: lock abstraction now, wire concrete pi-mono APIs next slice.
    await import("@mariozechner/pi-ai");
    this.piInitialized = true;
  }

  async planNextAction(
    context: PlannerContext,
    toolSchemas: Record<string, unknown>[]
  ): Promise<PlannedAction> {
    void toolSchemas;
    if (!this.piInitialized) {
      await this.initialize();
    }

    // TODO: Replace fallback with concrete pi-mono agent runtime invocation.
    return this.fallback.planNextAction(context, toolSchemas);
  }
}
