import process from "node:process";
import readline from "node:readline/promises";

import type { CompactHumanLoopTool } from "../../contracts/compact-human-loop-tool.js";
import type { CompactHumanLoopRequest, CompactHumanLoopResponse } from "../../domain/compact-reasoning.js";

export class TerminalCompactHumanLoopTool implements CompactHumanLoopTool {
  async requestClarification(request: CompactHumanLoopRequest): Promise<CompactHumanLoopResponse> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error("interactive sop-compact requires an interactive terminal (TTY)");
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      process.stdout.write("\n=== SOP Compact Clarification ===\n");
      process.stdout.write(`current understanding: ${request.current_understanding}\n`);
      process.stdout.write(`why it matters: ${request.why_this_matters}\n`);
      process.stdout.write(`question: ${request.focus_question}\n`);
      process.stdout.write("reply directly, or enter /defer or /stop\n");

      while (true) {
        const raw = (await rl.question("> ")).trim();
        if (!raw) {
          continue;
        }
        if (raw === "/defer") {
          return { human_reply: "", interaction_status: "defer" };
        }
        if (raw === "/stop") {
          return { human_reply: "", interaction_status: "stop" };
        }
        return {
          human_reply: raw,
          interaction_status: "answered",
        };
      }
    } finally {
      rl.close();
    }
  }
}
