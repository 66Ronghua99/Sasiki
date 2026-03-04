/**
 * Deps: playwright-core, domain/sop-trace.ts, domain/runtime-errors.ts
 * Used By: runtime/agent-runtime.ts
 * Last Updated: 2026-03-04
 */
import type { Browser, BrowserContext, ConsoleMessage, Frame, Page } from "playwright-core";

import { RuntimeError } from "../../domain/runtime-errors.js";
import type { DemonstrationRawEvent } from "../../domain/sop-trace.js";

export interface ObserveCaptureOptions {
  cdpEndpoint: string;
  singleTabOnly: true;
  timeoutMs: number;
}

interface RawBrowserEvent {
  type: "click" | "input" | "keydown" | "scroll";
  timestamp: number;
  url: string;
  payload: Record<string, unknown>;
}

const OBSERVE_CONSOLE_PREFIX = "__SASIKI_OBSERVE_EVENT__";
const OBSERVE_CAPTURE_SCRIPT = `
(() => {
  const marker = "__sasikiObserveInstalled__";
  if (window[marker]) {
    return;
  }
  window[marker] = true;

  const emit = (event) => {
    try {
      console.debug("${OBSERVE_CONSOLE_PREFIX}" + JSON.stringify(event));
    } catch {}
  };

  const getText = (element) => {
    if (!element || !("textContent" in element)) {
      return "";
    }
    return String(element.textContent || "").trim().slice(0, 120);
  };

  const buildSelector = (element) => {
    if (!(element instanceof Element)) {
      return "";
    }
    if (element.id) {
      return "#" + element.id;
    }
    const parts = [];
    let current = element;
    while (current && parts.length < 5) {
      const tag = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
      const index = siblings.indexOf(current) + 1;
      parts.unshift(tag + ":nth-of-type(" + index + ")");
      current = parent;
    }
    return parts.join(" > ");
  };

  document.addEventListener(
    "click",
    (event) => {
      if (!event.isTrusted) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      emit({
        type: "click",
        timestamp: Date.now(),
        url: location.href,
        payload: {
          selector: buildSelector(target),
          text: getText(target),
          role: target ? target.getAttribute("role") || "" : "",
        },
      });
    },
    true
  );

  document.addEventListener(
    "input",
    (event) => {
      if (!event.isTrusted) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      let value = "";
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        value = target.value || "";
      }
      emit({
        type: "input",
        timestamp: Date.now(),
        url: location.href,
        payload: {
          selector: buildSelector(target),
          text: getText(target),
          value,
        },
      });
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (!event.isTrusted) {
        return;
      }
      emit({
        type: "keydown",
        timestamp: Date.now(),
        url: location.href,
        payload: {
          key: event.key || "",
        },
      });
    },
    true
  );

  let lastScrollTs = 0;
  window.addEventListener(
    "scroll",
    () => {
      const now = Date.now();
      if (now - lastScrollTs < 250) {
        return;
      }
      lastScrollTs = now;
      emit({
        type: "scroll",
        timestamp: now,
        url: location.href,
        payload: {
          x: window.scrollX || 0,
          y: window.scrollY || 0,
        },
      });
    },
    true
  );
})();
`;

export class PlaywrightDemonstrationRecorder {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly events: DemonstrationRawEvent[] = [];
  private readonly listeners: Array<() => void> = [];
  private eventCounter = 0;
  private started = false;
  private multiTabDetected = false;

  async start(options: ObserveCaptureOptions): Promise<void> {
    const playwright = await import("playwright-core");
    this.browser = await playwright.chromium.connectOverCDP(options.cdpEndpoint);
    this.context = this.browser.contexts()[0] ?? (await this.browser.newContext());

    const pages = this.context.pages();
    if (options.singleTabOnly && pages.length > 1) {
      throw new RuntimeError("OBSERVE_MULTI_TAB_NOT_SUPPORTED", "observe mode supports single tab only", {
        existingTabs: pages.length,
      });
    }
    this.page = pages[0] ?? (await this.context.newPage());

    this.bindContextListener();
    await this.bindPage(this.page);
    this.pushEvent("navigate", this.page.url(), { reason: "observe_start" });
    this.started = true;
  }

  async stop(): Promise<DemonstrationRawEvent[]> {
    if (!this.started) {
      return [];
    }
    try {
      if (this.multiTabDetected) {
        throw new RuntimeError("OBSERVE_MULTI_TAB_NOT_SUPPORTED", "multiple tabs detected during observe");
      }
      return [...this.events];
    } finally {
      await this.dispose();
    }
  }

  private bindContextListener(): void {
    const context = this.requireContext();
    const onPage = (newPage: Page): void => {
      if (newPage === this.page) {
        return;
      }
      this.multiTabDetected = true;
    };
    context.on("page", onPage);
    this.listeners.push(() => context.off("page", onPage));
  }

  private async bindPage(page: Page): Promise<void> {
    const onConsole = (message: ConsoleMessage): void => {
      this.captureConsoleEvent(message);
    };
    const onFrameNavigated = (frame: Frame): void => {
      if (frame !== page.mainFrame()) {
        return;
      }
      this.pushEvent("navigate", page.url(), { reason: "main_frame_navigated" });
    };
    page.on("console", onConsole);
    page.on("framenavigated", onFrameNavigated);
    this.listeners.push(() => page.off("console", onConsole));
    this.listeners.push(() => page.off("framenavigated", onFrameNavigated));

    await page.addInitScript({ content: OBSERVE_CAPTURE_SCRIPT });
    try {
      await page.evaluate(OBSERVE_CAPTURE_SCRIPT);
    } catch {
      // Cross-origin and navigation races can make evaluate fail; init script still covers future documents.
    }
  }

  private captureConsoleEvent(message: ConsoleMessage): void {
    const text = message.text();
    if (!text.startsWith(OBSERVE_CONSOLE_PREFIX)) {
      return;
    }
    const jsonPart = text.slice(OBSERVE_CONSOLE_PREFIX.length);
    try {
      const event = JSON.parse(jsonPart) as RawBrowserEvent;
      this.pushEvent(event.type, event.url, event.payload, event.timestamp);
    } catch {
      // Ignore malformed capture events.
    }
  }

  private pushEvent(
    type: DemonstrationRawEvent["type"],
    url: string,
    payload: Record<string, unknown>,
    timestampMs?: number
  ): void {
    this.eventCounter += 1;
    this.events.push({
      eventId: `event_${String(this.eventCounter).padStart(6, "0")}`,
      timestamp: this.toIsoTimestamp(timestampMs),
      type,
      url,
      payload,
    });
  }

  private toIsoTimestamp(timestampMs?: number): string {
    if (typeof timestampMs === "number" && Number.isFinite(timestampMs)) {
      return new Date(timestampMs).toISOString();
    }
    return new Date().toISOString();
  }

  private requireContext(): BrowserContext {
    if (!this.context) {
      throw new Error("demonstration recorder context is not initialized");
    }
    return this.context;
  }

  private async dispose(): Promise<void> {
    for (const remove of this.listeners.splice(0, this.listeners.length)) {
      remove();
    }
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Ignore CDP close errors during teardown.
      }
    }
    this.browser = null;
    this.context = null;
    this.page = null;
    this.started = false;
  }
}
