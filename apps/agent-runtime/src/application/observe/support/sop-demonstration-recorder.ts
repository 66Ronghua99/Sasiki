/**
 * Deps: application/observe/support/sop-trace-builder.ts, application/observe/support/sop-trace-guide-builder.ts
 * Used By: application/observe/observe-executor.ts, application/shell/runtime-composition-root.ts
 * Last Updated: 2026-03-21
 */
import type { WebElementHint } from "../../../domain/sop-asset.js";
import type { DemonstrationRawEvent, SopTrace } from "../../../domain/sop-trace.js";
import { SopTraceBuilder, type BuildTraceInput } from "./sop-trace-builder.js";
import { SopTraceGuideBuilder } from "./sop-trace-guide-builder.js";

export class SopDemonstrationRecorder {
  private readonly traceBuilder: SopTraceBuilder;
  private readonly guideBuilder: SopTraceGuideBuilder;

  constructor() {
    this.traceBuilder = new SopTraceBuilder();
    this.guideBuilder = new SopTraceGuideBuilder();
  }

  buildTrace(input: BuildTraceInput): SopTrace {
    return this.traceBuilder.build(input);
  }

  buildDraft(trace: SopTrace): string {
    return this.guideBuilder.buildDraft(trace);
  }

  buildWebElementHints(trace: SopTrace): WebElementHint[] {
    return this.guideBuilder.buildWebElementHints(trace);
  }

  buildTags(trace: SopTrace): string[] {
    return this.guideBuilder.buildTags(trace);
  }
}

export type { BuildTraceInput, DemonstrationRawEvent };
