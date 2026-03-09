/**
 * Deps: node:fs/promises, node:path, domain/sop-compact-artifacts.ts, domain/sop-compact-artifacts-v1.ts, runtime/sop-compact.ts, runtime/sop-semantic-runner.ts
 * Used By: index.ts
 * Last Updated: 2026-03-09
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { IntentResolution } from "../domain/sop-compact-artifacts.js";
import type {
  ClarificationQuestionsV1,
  ExecutionGuideUnresolvedQuestion,
  ExecutionGuideV1,
} from "../domain/sop-compact-artifacts-v1.js";
import { SopCompactService } from "./sop-compact.js";
import type { SopCompactSemanticOptions } from "./sop-semantic-runner.js";

export interface SopCompactHitlInspectResult {
  mode: "inspect";
  runId: string;
  runDir: string;
  status: ExecutionGuideV1["status"];
  replayReady: boolean;
  unresolvedQuestions: ExecutionGuideUnresolvedQuestion[];
  clarificationQuestions: ClarificationQuestionsV1["questions"];
  intentResolutionPath?: string;
}

export interface SopCompactHitlResolveInput {
  runId: string;
  resolvedFields: Record<string, boolean | string>;
  notes: string[];
  rerun: boolean;
}

export interface SopCompactHitlResolveResult {
  mode: "resolve";
  runId: string;
  runDir: string;
  intentResolutionPath: string;
  resolvedFields: Record<string, boolean | string>;
  notes: string[];
  statusBefore: ExecutionGuideV1["status"];
  statusAfter: ExecutionGuideV1["status"];
  replayReadyAfter: boolean;
  unresolvedQuestionsAfter: ExecutionGuideUnresolvedQuestion[];
  rerunResult?: Awaited<ReturnType<SopCompactService["compact"]>>;
}

export class SopCompactHitlService {
  private readonly artifactsDir: string;
  private readonly semanticOptions: SopCompactSemanticOptions;

  constructor(artifactsDir: string, semanticOptions: SopCompactSemanticOptions) {
    this.artifactsDir = path.resolve(artifactsDir);
    this.semanticOptions = semanticOptions;
  }

  async inspect(runId: string): Promise<SopCompactHitlInspectResult> {
    const runDir = this.resolveRunDir(runId);
    const executionGuide = await this.readExecutionGuide(runDir);
    const clarificationQuestions = await this.readClarificationQuestions(runDir);
    const intentResolutionPath = await this.resolveExistingIntentResolution(runDir);
    return {
      mode: "inspect",
      runId,
      runDir,
      status: executionGuide.status,
      replayReady: executionGuide.replayReady,
      unresolvedQuestions: executionGuide.detailContext.unresolvedQuestions,
      clarificationQuestions: clarificationQuestions?.questions ?? [],
      intentResolutionPath,
    };
  }

  async resolve(input: SopCompactHitlResolveInput): Promise<SopCompactHitlResolveResult> {
    const runDir = this.resolveRunDir(input.runId);
    const before = await this.inspect(input.runId);
    const previousResolution = await this.readIntentResolution(runDir);
    const intentResolution: IntentResolution = {
      schemaVersion: "intent_resolution.v0",
      resolvedFields: {
        ...(previousResolution?.resolvedFields ?? {}),
        ...input.resolvedFields,
      },
      notes: [...(previousResolution?.notes ?? []), ...input.notes],
      resolvedAt: new Date().toISOString(),
    };
    const intentResolutionPath = path.join(runDir, "intent_resolution.json");
    await writeFile(intentResolutionPath, `${JSON.stringify(intentResolution, null, 2)}\n`, "utf-8");

    let rerunResult: Awaited<ReturnType<SopCompactService["compact"]>> | undefined;
    if (input.rerun) {
      rerunResult = await new SopCompactService(this.artifactsDir, {
        semantic: this.semanticOptions,
      }).compact(input.runId);
    }

    const afterGuide = await this.readExecutionGuide(runDir);
    return {
      mode: "resolve",
      runId: input.runId,
      runDir,
      intentResolutionPath,
      resolvedFields: intentResolution.resolvedFields,
      notes: intentResolution.notes,
      statusBefore: before.status,
      statusAfter: afterGuide.status,
      replayReadyAfter: afterGuide.replayReady,
      unresolvedQuestionsAfter: afterGuide.detailContext.unresolvedQuestions,
      rerunResult,
    };
  }

  private resolveRunDir(runId: string): string {
    return path.join(this.artifactsDir, runId);
  }

  private async readExecutionGuide(runDir: string): Promise<ExecutionGuideV1> {
    const raw = await readFile(path.join(runDir, "execution_guide.json"), "utf-8");
    return JSON.parse(raw) as ExecutionGuideV1;
  }

  private async readClarificationQuestions(runDir: string): Promise<ClarificationQuestionsV1 | undefined> {
    try {
      const raw = await readFile(path.join(runDir, "clarification_questions.json"), "utf-8");
      return JSON.parse(raw) as ClarificationQuestionsV1;
    } catch {
      return undefined;
    }
  }

  private async readIntentResolution(runDir: string): Promise<IntentResolution | undefined> {
    try {
      const raw = await readFile(path.join(runDir, "intent_resolution.json"), "utf-8");
      return JSON.parse(raw) as IntentResolution;
    } catch {
      return undefined;
    }
  }

  private async resolveExistingIntentResolution(runDir: string): Promise<string | undefined> {
    try {
      await readFile(path.join(runDir, "intent_resolution.json"), "utf-8");
      return path.join(runDir, "intent_resolution.json");
    } catch {
      return undefined;
    }
  }
}
