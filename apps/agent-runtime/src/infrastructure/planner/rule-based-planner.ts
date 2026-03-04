import type { Planner, PlannerContext } from "../../contracts/planner.js";
import type { PlannedAction } from "../../domain/agent-types.js";

export class RuleBasedPlanner implements Planner {
  async planNextAction(
    context: PlannerContext,
    toolSchemas: Record<string, unknown>[]
  ): Promise<PlannedAction> {
    void toolSchemas;
    if (context.stepIndex === 1) {
      return { action: "wait_for", seconds: 1, reason: "bootstrap" };
    }
    return { action: "done", reason: "fallback planner reached safe stop" };
  }
}
