/**
 * Deps: none
 * Used By: application/shell/workflow-registry.ts, application/shell/runtime-host.ts, application/shell/workflow-runtime.ts
 * Last Updated: 2026-03-21
 */
export interface HostedWorkflow<T> {
  prepare(): Promise<void>;
  execute(): Promise<T>;
  requestInterrupt(signal: "SIGINT" | "SIGTERM"): Promise<boolean>;
  dispose(): Promise<void>;
}

export type WorkflowFactory<T> = () => HostedWorkflow<T>;
