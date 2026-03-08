/**
 * Deps: node:process, node:readline/promises, contracts/hitl-controller.ts, domain/intervention-learning.ts
 * Used By: runtime/workflow-runtime.ts
 * Last Updated: 2026-03-06
 */
import process from "node:process";
import readline from "node:readline/promises";

import type { HitlController } from "../../contracts/hitl-controller.js";
import type { HitlInterventionRequest, HitlInterventionResponse } from "../../domain/intervention-learning.js";

export class TerminalHitlController implements HitlController {
  async requestIntervention(request: HitlInterventionRequest): Promise<HitlInterventionResponse> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error("HITL requires an interactive terminal (TTY)");
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      process.stdout.write("\n=== HITL Required ===\n");
      process.stdout.write(`runId: ${request.runId}\n`);
      process.stdout.write(`attempt: ${request.attempt}\n`);
      process.stdout.write(`issueType: ${request.issueType}\n`);
      process.stdout.write(`failureReason: ${request.failureReason}\n`);
      process.stdout.write(`operationIntent: ${request.operationIntent}\n`);
      if (request.context.elementHint) {
        process.stdout.write(`elementHint: ${request.context.elementHint}\n`);
      }
      if (request.context.inputVariable) {
        process.stdout.write(`inputVariable: ${request.context.inputVariable}\n`);
      }
      process.stdout.write(`beforeState: ${request.beforeState || "(unavailable)"}\n\n`);

      await rl.question("Finish the manual correction in the visible browser, then press Enter to continue.");
      const humanAction = (await rl.question("Human action taken: ")).trim();
      const nextTimeRule = (await rl.question("Reusable next-time rule: ")).trim();
      const resumeInstruction = (
        await rl.question("Resume instruction (Enter for default continue-from-current-state): ")
      ).trim();

      return {
        humanAction: humanAction || "Manual browser intervention completed by operator.",
        nextTimeRule: nextTimeRule || "When the same issue appears, use the manual correction that just worked.",
        resumeInstruction: resumeInstruction || "Continue from the current browser state and finish the remaining task.",
      };
    } finally {
      rl.close();
    }
  }
}
