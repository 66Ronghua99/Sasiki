export type DesktopWorkflow = "observe" | "sop-compact" | "refine";

export type DesktopRunStatus =
  | "queued"
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "interrupted";

export interface ObserveRunInput {
  task: string;
  siteAccountId?: string;
}

export interface CompactRunInput {
  sourceRunId: string;
  semanticMode?: "preserve" | "summarize";
}

export interface RefineRunInput {
  task?: string;
  siteAccountId?: string;
  skillName?: string;
  resumeRunId?: string;
}

export interface DesktopRunSummary {
  runId: string;
  workflow: DesktopWorkflow;
  status: DesktopRunStatus;
  siteAccountId?: string;
  taskSummary: string | null;
  sourceRunId: string | null;
  createdAt: string;
  updatedAt: string;
  artifactPath: string | null;
}

export type DesktopRunLogLevel = "info" | "warning" | "error";

export const desktopRunEventKinds = [
  "run.queued",
  "run.started",
  "run.log",
  "run.finished",
  "run.interrupted",
] as const;

export type DesktopRunEventKind = (typeof desktopRunEventKinds)[number];

interface DesktopRunEventBase {
  runId: string;
  workflow: DesktopWorkflow;
  timestamp: string;
}

export type DesktopRunEvent =
  | (DesktopRunEventBase & {
      type: "run.queued";
      status: "queued" | "starting";
    })
  | (DesktopRunEventBase & {
      type: "run.started";
      status: "running";
    })
  | (DesktopRunEventBase & {
      type: "run.log";
      level: DesktopRunLogLevel;
      message: string;
    })
  | (DesktopRunEventBase & {
      type: "run.finished";
      status: "completed" | "failed";
      resultSummary?: string;
    })
  | (DesktopRunEventBase & {
      type: "run.interrupted";
      status: "interrupted";
      reason?: string;
    });
