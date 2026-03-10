/**
 * Deps: domain/sop-trace.ts
 * Used By: runtime/interactive-sop-compact.ts
 * Last Updated: 2026-03-10
 */
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

export interface CompactHint {
  selector?: string;
  text?: string;
  role?: string;
}

export interface BuiltCompact {
  stepCount: number;
  tabs: string[];
  highSteps: string[];
  hints: CompactHint[];
}

export function serializeCompactHint(hint: CompactHint): string {
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

export class SopRuleCompactBuilder {
  build(trace: SopTrace): BuiltCompact {
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
    const text = step.target.type === "text" ? this.readString(step.target.value) : this.readString(step.input.textHint);
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
