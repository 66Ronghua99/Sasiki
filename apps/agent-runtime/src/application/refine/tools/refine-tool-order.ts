export const REFINE_TOOL_ORDER = [
  "observe.page",
  "observe.query",
  "act.click",
  "act.type",
  "act.press",
  "act.navigate",
  "act.select_tab",
  "act.screenshot",
  "act.file_upload",
  "hitl.request",
  "knowledge.record_candidate",
  "run.finish",
] as const;

export type RefineToolName = (typeof REFINE_TOOL_ORDER)[number];
