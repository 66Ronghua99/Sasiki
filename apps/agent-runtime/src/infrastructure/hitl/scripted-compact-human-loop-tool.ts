import type { CompactHumanLoopTool } from "../../contracts/compact-human-loop-tool.js";
import type { CompactHumanLoopRequest, CompactHumanLoopResponse } from "../../domain/compact-reasoning.js";

const JSON_LIKE_PREFIXES = ["[", "\"", "{"] as const;

export function parseScriptedCompactReplies(raw: string | undefined): string[] {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string") {
      return normalizeReplies([parsed]);
    }
    if (Array.isArray(parsed)) {
      return normalizeReplies(parsed);
    }
    throw new Error("SASIKI_COMPACT_SCRIPTED_REPLIES must be a JSON string or string array");
  } catch (error) {
    if (JSON_LIKE_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
      throw new Error(
        `invalid SASIKI_COMPACT_SCRIPTED_REPLIES payload: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return normalizeReplies([trimmed]);
  }
}

export function createScriptedCompactHumanLoopToolFactory(
  raw: string | undefined
): (() => ScriptedCompactHumanLoopTool) | undefined {
  const replies = parseScriptedCompactReplies(raw);
  if (replies.length === 0) {
    return undefined;
  }
  return () => new ScriptedCompactHumanLoopTool(replies);
}

export class ScriptedCompactHumanLoopTool implements CompactHumanLoopTool {
  private readonly replies: string[];
  private nextIndex = 0;

  constructor(replies: string[]) {
    this.replies = normalizeReplies(replies);
  }

  async requestClarification(_request: CompactHumanLoopRequest): Promise<CompactHumanLoopResponse> {
    const nextReply = this.replies[this.nextIndex];
    if (!nextReply) {
      throw new Error("scripted sop-compact replies exhausted before the session converged");
    }
    this.nextIndex += 1;
    return {
      human_reply: nextReply,
      interaction_status: "answered",
    };
  }
}

function normalizeReplies(values: unknown[]): string[] {
  const replies: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") {
      throw new Error("scripted sop-compact replies must contain only strings");
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    replies.push(trimmed);
  }
  return replies;
}
