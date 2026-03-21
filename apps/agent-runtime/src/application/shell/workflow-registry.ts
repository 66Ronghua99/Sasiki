/**
 * Deps: application/shell/workflow-contract.ts
 * Used By: application/shell/workflow-runtime.ts
 * Last Updated: 2026-03-21
 */
import type { WorkflowFactory } from "./workflow-contract.js";

export interface WorkflowRegistry<TCommand extends string = string> {
  resolve(command: TCommand): WorkflowFactory<unknown> | undefined;
}

export function createWorkflowRegistry<TFactories extends Record<string, WorkflowFactory<unknown>>>(
  factories: TFactories
): WorkflowRegistry<Extract<keyof TFactories, string>> {
  return {
    resolve(command) {
      return factories[command];
    },
  };
}
