import type { PlannedAction } from "../domain/agent-types.js";

export interface PlannerContext {
  task: string;
  snapshot: string;
  stepIndex: number;
  maxSteps: number;
  history: string;
}

export interface Planner {
  planNextAction(context: PlannerContext, toolSchemas: Record<string, unknown>[]): Promise<PlannedAction>;
}
