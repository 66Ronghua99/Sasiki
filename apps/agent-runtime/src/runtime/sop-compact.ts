/**
 * Deps: node:fs/promises, node:path, domain/sop-trace.ts, core/semantic-compactor.ts
 * Used By: index.ts
 * Last Updated: 2026-03-05
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { SemanticCompactor, type SemanticMode, type SemanticThinkingLevel } from "../core/semantic-compactor.js";
import type { SopTrace, SopTraceStep } from "../domain/sop-trace.js";

const FUNCTIONAL_KEYS = new Set([
  "Enter",
  "Tab",
  "Escape",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Space",
  "F2",
]);
const TYPING_NOISE_KEYS = new Set(["Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);
const NOISE_SHORTCUTS = new Set(["Ctrl+C", "Cmd+C", "Ctrl+X", "Cmd+X"]);
const MODIFIER_KEYS = new Set(["Control", "Meta", "Alt", "Shift"]);
const MODIFIER_LABEL: Record<string, string> = {
  Control: "Ctrl",
  Meta: "Cmd",
  Alt: "Alt",
  Shift: "Shift",
};

interface PendingInput {
  tabId: string;
  target: string;
  value: string;
  submitCount: number;
}

interface PendingScroll {
  tabId: string;
  count: number;
}

interface CompactHint {
  selector?: string;
  text?: string;
  role?: string;
}

interface SopCompactSemanticOptions {
  mode: SemanticMode;
  timeoutMs: number;
  model: string;
  apiKey: string;
  baseUrl?: string;
  thinkingLevel: SemanticThinkingLevel;
}

interface SopCompactServiceOptions {
  semantic?: SopCompactSemanticOptions;
}

interface SemanticOutcome {
  mode: SemanticMode;
  fallback: boolean;
  guidePath?: string;
  guideMarkdown?: string;
  error?: string;
  model?: string;
  provider?: string;
  stopReason?: string;
}

interface BuiltCompact {
  stepCount: number;
  tabs: string[];
  highSteps: string[];
  hints: CompactHint[];
}

export interface SopCompactResult {
  runId: string;
  runDir: string;
  sourceTracePath: string;
  compactPath: string;
  semanticMode: SemanticMode;
  semanticFallback: boolean;
  semanticGuidePath?: string;
  sourceSteps: number;
  compactSteps: number;
  tabs: string[];
}

export class SopCompactService {
  private readonly artifactsDir: string;
  private readonly semanticOptions: SopCompactSemanticOptions;

  constructor(artifactsDir: string, options?: SopCompactServiceOptions) {
    this.artifactsDir = path.resolve(artifactsDir);
    this.semanticOptions = options?.semantic ?? {
      mode: "off",
      timeoutMs: 12000,
      model: "openai/gpt-4o-mini",
      apiKey: "",
      thinkingLevel: "minimal",
    };
    process.stdout.write(`Initialized SopCompactService with artifactsDir=${this.artifactsDir} and semanticOptions=${JSON.stringify(this.semanticOptions)}\n`);
  }

  async compact(runId: string): Promise<SopCompactResult> {
    const runDir = path.join(this.artifactsDir, runId);
    const sourceTracePath = path.join(runDir, "demonstration_trace.json");
    const compactPath = path.join(runDir, "sop_compact.md");
    const trace = await this.readTrace(sourceTracePath);
    const built = this.buildCompact(trace);
    const semantic = await this.runSemanticCompaction(runId, runDir, trace, built);
    const markdown = this.renderCompactMarkdown({
      runId,
      sourceTracePath,
      trace,
      built,
      semantic,
    });

    if (semantic.guidePath && semantic.guideMarkdown) {
      await writeFile(semantic.guidePath, semantic.guideMarkdown, "utf-8");
    }
    await writeFile(compactPath, markdown, "utf-8");

    return {
      runId,
      runDir,
      sourceTracePath,
      compactPath,
      semanticMode: semantic.mode,
      semanticFallback: semantic.fallback,
      semanticGuidePath: semantic.guidePath,
      sourceSteps: trace.steps.length,
      compactSteps: built.stepCount,
      tabs: built.tabs,
    };
  }

  private async readTrace(tracePath: string): Promise<SopTrace> {
    const raw = await readFile(tracePath, "utf-8");
    return JSON.parse(raw) as SopTrace;
  }

  private buildCompact(trace: SopTrace): BuiltCompact {
    const highSteps: string[] = [];
    const hintMap = new Map<string, CompactHint>();
    const tabs = new Set<string>();
    let currentTab = "";
    let lastActionTab = "";
    let lastActionText = "";
    let pendingInput: PendingInput | null = null;
    let pendingScroll: PendingScroll | null = null;

    const pushStep = (tabId: string, text: string): void => {
      if (lastActionTab === tabId && lastActionText === text) {
        return;
      }
      tabs.add(tabId);
      if (currentTab !== tabId) {
        highSteps.push(`切换到 ${tabId}`);
        currentTab = tabId;
      }
      highSteps.push(text);
      lastActionTab = tabId;
      lastActionText = text;
    };
    const flushInput = (): void => {
      if (!pendingInput) {
        return;
      }
      const actionText = pendingInput.value
        ? `在 ${pendingInput.target} 输入“${pendingInput.value}”`
        : `清空 ${pendingInput.target}`;
      pushStep(pendingInput.tabId, actionText);
      if (pendingInput.submitCount > 0) {
        pushStep(pendingInput.tabId, "按下 Enter");
      }
      pendingInput = null;
    };
    const flushScroll = (): void => {
      if (!pendingScroll) {
        return;
      }
      const actionText = pendingScroll.count > 1 ? `滚动页面 ${pendingScroll.count} 次` : "滚动页面";
      pushStep(pendingScroll.tabId, actionText);
      pendingScroll = null;
    };

    for (let index = 0; index < trace.steps.length; index += 1) {
      const step = trace.steps[index];
      const tabId = step.tabId?.trim() || "tab-unknown";

      if (step.action === "wait") {
        continue;
      }

      if (step.action === "type") {
        flushScroll();
        this.collectHint(step, hintMap);
        const value = this.readString(step.input.value) ?? "";
        const target = this.formatTarget(step);
        if (!pendingInput || pendingInput.tabId !== tabId || pendingInput.target !== target) {
          flushInput();
          pendingInput = { tabId, target, value, submitCount: 0 };
        } else {
          pendingInput.value = value;
        }
        continue;
      }

      if (step.action === "scroll") {
        flushInput();
        if (pendingScroll && pendingScroll.tabId === tabId) {
          pendingScroll.count += 1;
        } else {
          flushScroll();
          pendingScroll = { tabId, count: 1 };
        }
        continue;
      }

      if (step.action === "press_key") {
        const currentKey = this.normalizeKey(step.target.value);
        if (pendingInput && pendingInput.tabId === tabId && currentKey === "Enter") {
          pendingInput.submitCount += 1;
          continue;
        }
        const combo = this.tryBuildShortcut(trace.steps, index, tabId, currentKey);
        if (combo) {
          if (pendingInput && pendingInput.tabId === tabId && NOISE_SHORTCUTS.has(combo.label)) {
            index = combo.consumeTo;
            continue;
          }
          flushInput();
          flushScroll();
          pushStep(tabId, `按下 ${combo.label}`);
          index = combo.consumeTo;
          continue;
        }
        if (pendingInput && pendingInput.tabId === tabId && TYPING_NOISE_KEYS.has(currentKey)) {
          continue;
        }
        if (!FUNCTIONAL_KEYS.has(currentKey)) {
          continue;
        }
        flushInput();
        flushScroll();
        pushStep(tabId, `按下 ${currentKey}`);
        continue;
      }

      flushInput();
      flushScroll();
      if (step.action === "click") {
        this.collectHint(step, hintMap);
        pushStep(tabId, `点击 ${this.formatTarget(step)}`);
        continue;
      }

      if (step.action === "navigate") {
        pushStep(tabId, `打开 ${step.target.value}`);
        continue;
      }
    }

    flushInput();
    flushScroll();
    return {
      stepCount: highSteps.length,
      tabs: [...tabs],
      highSteps,
      hints: [...hintMap.values()],
    };
  }

  private renderCompactMarkdown(input: {
    runId: string;
    sourceTracePath: string;
    trace: SopTrace;
    built: BuiltCompact;
    semantic: SemanticOutcome;
  }): string {
    const { runId, sourceTracePath, trace, built, semantic } = input;
    const lines: string[] = [];
    lines.push("# SOP Compact (v0)");
    lines.push("");
    lines.push(`- runId: ${runId}`);
    lines.push(`- traceId: ${trace.traceId}`);
    lines.push(`- site: ${trace.site}`);
    lines.push(`- taskHint: ${trace.taskHint}`);
    lines.push(`- generatedAt: ${new Date().toISOString()}`);
    lines.push(`- sourceTrace: ${sourceTracePath}`);
    lines.push(`- semanticMode: ${semantic.mode}`);
    lines.push(`- semanticFallback: ${semantic.fallback}`);
    if (semantic.guidePath) {
      lines.push(`- semanticGuidePath: ${semantic.guidePath}`);
    }
    if (semantic.model) {
      lines.push(`- semanticModel: ${semantic.model}`);
    }
    if (semantic.provider) {
      lines.push(`- semanticProvider: ${semantic.provider}`);
    }
    if (semantic.stopReason) {
      lines.push(`- semanticStopReason: ${semantic.stopReason}`);
    }
    if (semantic.error) {
      lines.push(`- semanticError: ${semantic.error}`);
    }
    lines.push("");
    lines.push("## High-Level Steps");
    for (let i = 0; i < built.highSteps.length; i += 1) {
      lines.push(`${i + 1}. ${built.highSteps[i]}`);
    }
    lines.push("");
    lines.push("## Hints");
    if (built.hints.length === 0) {
      lines.push("- 无可提取的关键元素提示");
    } else {
      for (const hint of built.hints) {
        const serialized = this.serializeHint(hint);
        if (serialized) {
          lines.push(`- ${serialized}`);
        }
      }
    }
    lines.push("");
    return `${lines.join("\n")}\n`;
  }

  private async runSemanticCompaction(
    runId: string,
    runDir: string,
    trace: SopTrace,
    built: BuiltCompact
  ): Promise<SemanticOutcome> {
    const mode = this.semanticOptions.mode;
    if (mode === "off") {
      return { mode, fallback: false };
    }

    try {
      const compactor = new SemanticCompactor({
        model: this.semanticOptions.model,
        apiKey: this.semanticOptions.apiKey,
        baseUrl: this.semanticOptions.baseUrl,
        timeoutMs: this.semanticOptions.timeoutMs,
        thinkingLevel: this.semanticOptions.thinkingLevel,
      });
      const result = await compactor.compact({
        runId,
        traceId: trace.traceId,
        site: trace.site,
        taskHint: trace.taskHint,
        highLevelSteps: built.highSteps,
        hints: built.hints.map((hint) => this.serializeHint(hint)).filter((hint) => hint.length > 0),
      });
      const guidePath = path.join(runDir, "guide_semantic.md");
      await this.appendRuntimeLog(runDir, "INFO", "semantic_compaction_succeeded", {
        runId,
        mode,
        guidePath,
        model: result.model,
        provider: result.provider,
        stopReason: result.stopReason,
      });
      return {
        mode,
        fallback: false,
        guidePath,
        guideMarkdown: result.markdown,
        model: result.model,
        provider: result.provider,
        stopReason: result.stopReason,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.appendRuntimeLog(runDir, "WARN", "semantic_compaction_fallback", { runId, mode, reason });
      return { mode, fallback: true, error: reason };
    }
  }

  private serializeHint(hint: CompactHint): string {
    const segments: string[] = [];
    if (hint.selector) {
      segments.push(`selector: ${hint.selector}`);
    }
    if (hint.text) {
      segments.push(`text: ${hint.text}`);
    }
    if (hint.role) {
      segments.push(`role: ${hint.role}`);
    }
    return segments.join(" | ");
  }

  private async appendRuntimeLog(
    runDir: string,
    level: "INFO" | "WARN" | "ERROR",
    event: string,
    payload?: Record<string, unknown>
  ): Promise<void> {
    const runtimeLogPath = path.join(runDir, "runtime.log");
    const line = `${new Date().toISOString()} ${level} ${event}${payload ? ` ${JSON.stringify(payload)}` : ""}`;
    let existing = "";
    try {
      existing = await readFile(runtimeLogPath, "utf-8");
    } catch {
      existing = "";
    }
    const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
    await writeFile(runtimeLogPath, `${existing}${prefix}${line}\n`, "utf-8");
  }

  private tryBuildShortcut(
    steps: SopTraceStep[],
    index: number,
    tabId: string,
    key: string
  ): { label: string; consumeTo: number } | null {
    if (!MODIFIER_KEYS.has(key) || index + 1 >= steps.length) {
      return null;
    }
    const next = steps[index + 1];
    if (next.action !== "press_key" || (next.tabId?.trim() || "tab-unknown") !== tabId) {
      return null;
    }
    const nextKey = this.normalizeKey(next.target.value);
    if (MODIFIER_KEYS.has(nextKey)) {
      return null;
    }
    const nextLabel = nextKey.length === 1 ? nextKey.toUpperCase() : nextKey;
    return { label: `${MODIFIER_LABEL[key]}+${nextLabel}`, consumeTo: index + 1 };
  }

  private collectHint(step: SopTraceStep, hints: Map<string, CompactHint>): void {
    const selector = step.target.type === "selector" ? this.readString(step.target.value) : undefined;
    const text =
      step.target.type === "text" ? this.readString(step.target.value) : this.readString(step.input.textHint);
    const role = this.readString(step.input.roleHint);
    if (!selector && !text && !role) {
      return;
    }
    const key = [selector ?? "", text ?? "", role ?? ""].join("|");
    if (hints.has(key)) {
      return;
    }
    hints.set(key, { selector, text, role });
  }

  private formatTarget(step: SopTraceStep): string {
    if (step.target.type === "selector") {
      return `选择器 "${step.target.value}"`;
    }
    if (step.target.type === "text") {
      return `文本 "${step.target.value}"`;
    }
    if (step.target.type === "url") {
      return `URL "${step.target.value}"`;
    }
    return `按键 "${step.target.value}"`;
  }

  private normalizeKey(raw: string): string {
    const key = raw.trim();
    if (key === " ") {
      return "Space";
    }
    if (key === "Esc") {
      return "Escape";
    }
    if (key === "Del") {
      return "Delete";
    }
    return key;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
  }
}
