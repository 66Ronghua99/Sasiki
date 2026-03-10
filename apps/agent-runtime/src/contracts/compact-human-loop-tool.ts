import type { CompactHumanLoopRequest, CompactHumanLoopResponse } from "../domain/compact-reasoning.js";

export interface CompactHumanLoopTool {
  requestClarification(request: CompactHumanLoopRequest): Promise<CompactHumanLoopResponse>;
}
