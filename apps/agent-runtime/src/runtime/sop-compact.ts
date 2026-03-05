/**
 * Deps: node:fs/promises, node:path, domain/sop-trace.ts
 * Used By: index.ts
 * Last Updated: 2026-03-05
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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
}

interface PendingScroll {
  tabId: string;
  count: number;
}

export interface SopCompactResult {
  runId: string;
  runDir: string;
  sourceTracePath: string;
  compactPath: string;
  sourceSteps: number;
  compactSteps: number;
  tabs: string[];
}

export class SopCompactService {
  private readonly artifactsDir: string;

  constructor(artifactsDir: string) {
    this.artifactsDir = path.resolve(artifactsDir);
  }

  async compact(runId: string): Promise<SopCompactResult> {
    const runDir = path.join(this.artifactsDir, runId);
    const sourceTracePath = path.join(runDir, "demonstration_trace.json");
    const compactPath = path.join(runDir, "sop_compact.md");
    const trace = await this.readTrace(sourceTracePath);
    const built = this.buildCompact(trace, runId, sourceTracePath);
    await writeFile(compactPath, built.markdown, "utf-8");
    return {
      runId,
      runDir,
      sourceTracePath,
      compactPath,
      sourceSteps: trace.steps.length,
      compactSteps: built.stepCount,
      tabs: built.tabs,
    };
  }

  private async readTrace(tracePath: string): Promise<SopTrace> {
    const raw = await readFile(tracePath, "utf-8");
    return JSON.parse(raw) as SopTrace;
  }

  private buildCompact(
    trace: SopTrace,
    runId: string,
    sourceTracePath: string
  ): { markdown: string; stepCount: number; tabs: string[] } {
    const lines: string[] = [];
    const highSteps: string[] = [];
    const hintSet = new Set<string>();
    const tabs = new Set<string>();
    let currentTab = "";
    let pendingInput: PendingInput | null = null;
    let pendingScroll: PendingScroll | null = null;

    const pushStep = (tabId: string, text: string): void => {
      tabs.add(tabId);
      if (currentTab !== tabId) {
        highSteps.push(`切换到 ${tabId}`);
        currentTab = tabId;
      }
      highSteps.push(text);
    };
    const flushInput = (): void => {
      if (!pendingInput) {
        return;
      }
      const actionText = pendingInput.value
        ? `在 ${pendingInput.target} 输入“${pendingInput.value}”`
        : `清空 ${pendingInput.target}`;
      pushStep(pendingInput.tabId, actionText);
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

      if (step.action === "type") {
        flushScroll();
        this.collectHint(step, hintSet);
        const value = this.readString(step.input.value) ?? "";
        const target = this.formatTarget(step);
        if (!pendingInput || pendingInput.tabId !== tabId || pendingInput.target !== target) {
          flushInput();
          pendingInput = { tabId, target, value };
        } else {
          pendingInput.value = value || pendingInput.value;
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
        const combo = this.tryBuildShortcut(trace.steps, index, tabId, currentKey);
        if (combo) {
          flushInput();
          flushScroll();
          pushStep(tabId, `按下 ${combo.label}`);
          index = combo.consumeTo;
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
        this.collectHint(step, hintSet);
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
    lines.push("# SOP Compact (v0)");
    lines.push("");
    lines.push(`- runId: ${runId}`);
    lines.push(`- traceId: ${trace.traceId}`);
    lines.push(`- site: ${trace.site}`);
    lines.push(`- taskHint: ${trace.taskHint}`);
    lines.push(`- generatedAt: ${new Date().toISOString()}`);
    lines.push(`- sourceTrace: ${sourceTracePath}`);
    lines.push("");
    lines.push("## High-Level Steps");
    for (let i = 0; i < highSteps.length; i += 1) {
      lines.push(`${i + 1}. ${highSteps[i]}`);
    }
    lines.push("");
    lines.push("## Hints");
    if (hintSet.size === 0) {
      lines.push("- 无可提取的关键元素提示");
    } else {
      for (const hint of hintSet) {
        lines.push(`- ${hint}`);
      }
    }
    lines.push("");

    return {
      markdown: `${lines.join("\n")}\n`,
      stepCount: highSteps.length,
      tabs: [...tabs],
    };
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

  private collectHint(step: SopTraceStep, hints: Set<string>): void {
    if (step.target.type === "selector" && step.target.value.trim()) {
      hints.add(`selector: ${step.target.value.trim()}`);
      return;
    }
    if (step.target.type === "text" && step.target.value.trim()) {
      hints.add(`text: ${step.target.value.trim()}`);
    }
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
